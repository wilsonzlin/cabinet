import { Ff, FfmpegLogLevel } from "@wzlin/ff";

export const DEFAULT_AUDIO_EXTENSIONS = new Set(["mp3", "ogg", "wav"]);

export const DEFAULT_VIDEO_EXTENSIONS = new Set([
  "3gp",
  "avi",
  "flv",
  "m4v",
  "mkv",
  "mp4",
  "rm",
  "rmvb",
  "webm",
  "wmv",
]);

export const DEFAULT_PHOTO_EXTENSIONS = new Set([
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
]);

export const ff = new Ff({
  logLevel: FfmpegLogLevel.FATAL,
  ffprobeCommand: "ffprobe",
  ffmpegCommand: "ffmpeg",
});
