import { Ff } from "@wzlin/ff";
import { execFile, spawn } from "child_process";
import PromiseQueue from "extlib/js/PromiseQueue";
import os from "os";

// Leave 1 virtual core:
// - Allow HTTP requests to continue to be processed.
// - ffmpeg commands are already multithreaded, so utilising all cores is probably oversaturating the CPU.
// - NOTE: It still won't prevent storage bottlenecks.
export const queue = new PromiseQueue(os.cpus().length - 1);

// TODO BUG extlib/js/exec has bugs around heavy concurrent invocation causing lost stdout. It's also quite slow. Temporarily directly use built-in library.
export const ff = new Ff({
  runCommandWithoutStdout: (command, args) =>
    queue.add(
      () =>
        new Promise((resolve, reject) => {
          const proc = spawn(command, args, {
            stdio: ["ignore", "inherit", "inherit"],
          });
          proc.on("error", reject);
          proc.on("exit", resolve);
        })
    ),
  runCommandWithStdout: (command, args) =>
    queue.add(
      () =>
        new Promise((resolve, reject) => {
          execFile(command, args, (error, stdout) => {
            if (error) {
              reject(error);
            } else {
              resolve(stdout);
            }
          });
        })
    ),
});

// We could use this in the future.
export const webmSegment = (
  input: string,
  start: number,
  end: number,
  output: string
) =>
  ff.convert({
    input: {
      file: input,
      start,
      end,
    },
    video: {
      codec: "vp9",
      deadline: "realtime",
      cpuUsed: 8,
      multithreading: true,
      // Suggested values from https://developers.google.com/media/vp9/settings/vod/.
      mode: "constrained-quality",
      minBitrate: "9000K",
      targetBitrate: "18000K",
      maxBitrate: "26100K",
    },
    audio: {
      codec: "libopus",
    },
    metadata: false,
    output: {
      format: "webm",
      file: output,
    },
  });

export type GaplessMetadata = {
  duration: number;
  start: number;
  end: number;
};

// Sourced from https://developers.google.com/web/fundamentals/media/mse/seamless-playback.
export const parseGaplessMetadata = (
  bytesAsString: string,
  sampleRate: number
): GaplessMetadata | undefined => {
  const iTunesDataIndex = bytesAsString.indexOf("iTunSMPB");
  if (iTunesDataIndex == -1) {
    return undefined;
  }

  const frontPaddingIndex = iTunesDataIndex + 34;
  const frontPadding = parseInt(bytesAsString.substr(frontPaddingIndex, 8), 16);

  const endPaddingIndex = frontPaddingIndex + 9;
  const endPadding = parseInt(bytesAsString.substr(endPaddingIndex, 8), 16);

  const sampleCountIndex = endPaddingIndex + 9;
  const realSamples = parseInt(bytesAsString.substr(sampleCountIndex, 16), 16);

  return {
    start: frontPadding / sampleRate,
    duration: realSamples / sampleRate,
    end: endPadding / sampleRate,
  };
};