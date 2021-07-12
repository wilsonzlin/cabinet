import { Ff } from "@wzlin/ff";
import exec from "@xtjs/lib/js/exec";
import PromiseQueue from "@xtjs/lib/js/PromiseQueue";
import { execFile, spawn } from "child_process";
import os from "os";

// Leave 1 virtual core:
// - Allow HTTP requests to continue to be processed.
// - ffmpeg commands are already multithreaded, so utilising all cores is probably oversaturating the CPU.
// - NOTE: It still won't prevent storage bottlenecks.
export const queue = new PromiseQueue(os.cpus().length - 1);

// TODO BUG @xtjs/lib/js/exec has bugs around heavy concurrent invocation causing lost stdout. It's also quite slow. Temporarily directly use built-in library.
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

export const getMp4CodecString = async (absPath: string) => {
  const out: {
    // Won't be set if invalid file.
    file?: {
      major_brand: string;
      minor_version: number;
      compatible_brands: Array<string>;
      fast_start: boolean;
    };
    // Won't have any properties if invalid file.
    movie: {
      duration_ms?: number;
      duration?: number;
      time_scale?: number;
      fragments?: boolean;
    };
    // Won't be set if invalid file.
    tracks?: Array<{
      flags: number;
      flag_names: Array<string>;
      id: number;
      type: string;
      duration_ms: number;
      language: string;
      media: {
        sample_count: number;
        timescale: number;
        duration: number;
        duration_ms: number;
      };
      sample_descriptions: Array<{
        coding: string;
        coding_name: string;
        codecs_string: string;
        stream_type: number;
        stream_type_name: string;
        object_type: number;
        object_type_name: string;
        max_bitrate: number;
        average_bitrate: number;
        buffer_size: number;
        decoder_info: string;
        sample_rate: number;
        sample_size: number;
        channels: number;
      }>;
    }>;
  } = await exec("mp4info", "--format", "json", "--fast", absPath)
    .output()
    .then((r) => JSON.parse(r));
  return out.tracks?.[0].sample_descriptions[0].codecs_string;
};
