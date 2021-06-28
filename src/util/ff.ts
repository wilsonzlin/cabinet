import { Ff, FfmpegLogLevel } from "@wzlin/ff";

export const ff = new Ff({
  logLevel: FfmpegLogLevel.FATAL,
  ffprobeCommand: "ffprobe",
  ffmpegCommand: "ffmpeg",
});
