import { Ff, FfmpegLogLevel } from "@wzlin/ff";
import exec from "extlib/js/exec";
import PromiseQueue from "extlib/js/PromiseQueue";
import os from "os";

const queue = new PromiseQueue(os.cpus().length);

export const ff = new Ff({
  ffmpegCommand: "ffmpeg",
  ffprobeCommand: "ffprobe",
  logLevel: FfmpegLogLevel.ERROR,
  runCommandWithoutStdout: (command, args) =>
    queue.add(() => exec(command, ...args).status()),
  runCommandWithStdout: (command, args, throwOnStderr) =>
    queue.add(() =>
      exec(command, ...args)
        .killOnStderr(throwOnStderr)
        .text()
        .output()
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
