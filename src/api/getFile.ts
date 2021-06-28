import assertExists from "extlib/js/assertExists";
import maybeFileStats from "extlib/js/maybeFileStats";
import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { Video } from "../library/model";
import { ClientError, SendFile, StreamFile } from "../server/response";
import { ff } from "../util/ff";
import { ApiCtx } from "./_common";

const streamVideoCapture = async ({
  ctx,
  video,
  start,
  end,
  type,
  silent,
}: {
  ctx: ApiCtx;
  video: Video;
  start?: number;
  end?: number;
  type?: string;
  silent: boolean;
}) => {
  const { scratch } = ctx;
  if (!scratch) {
    throw new ClientError(404, "No scratch directory available");
  }

  if (
    start == undefined ||
    start < 0 ||
    start > video.duration() ||
    end == undefined ||
    end < 0 ||
    end > video.duration()
  ) {
    throw new ClientError(400, "Bad range");
  }

  const duration = end - start + 1;
  if (duration >= 60) {
    throw new ClientError(400, "Too long");
  }

  const mime = {
    gif: "image/gif",
    low: "video/mp4",
    medium: "video/mp4",
    high: "video/mp4",
    original: "video/mp4",
  }[type ?? ""];
  if (!mime) {
    throw new ClientError(400, "Invalid type");
  }

  const audio = type != "gif" && !silent;

  const outputFile = join(
    scratch,
    video.absPath,
    `capture.${start}-${end}.${type}${audio ? `` : `.silent`}`
  );
  await mkdir(dirname(outputFile), { recursive: true });
  let outputFileStats = await maybeFileStats(outputFile);
  if (!outputFileStats) {
    await ff.convert({
      input: {
        file: video.absPath,
        start,
        duration,
      },
      metadata: false,
      video:
        type == "gif"
          ? {
              codec: "gif",
              loop: true,
              fps: Math.min(10, video.fps()),
              resize: { width: Math.min(800, video.width()) },
            }
          : {
              codec: "libx264",
              preset: "veryfast",
              crf: 17,
              fps: Math.min(
                type == "low"
                  ? 10
                  : type == "medium"
                  ? 30
                  : type == "high"
                  ? 60
                  : Infinity,
                video.fps()
              ),
              resize: {
                width: Math.min(
                  type == "low"
                    ? 800
                    : type == "medium"
                    ? 1280
                    : type == "high"
                    ? 1920
                    : Infinity,
                  video.width()
                ),
              },
              movflags: ["faststart"],
            },
      audio: type != "gif" && audio,
      output: {
        format: type == "gif" ? "gif" : "mp4",
        file: outputFile,
      },
    });
    outputFileStats = assertExists(await maybeFileStats(outputFile));
  }
  return new StreamFile(
    outputFile,
    outputFileStats.size,
    mime,
    `${video.fileName()} (capture ${duration}s, ${type}${
      audio ? "" : ", silent"
    })`
  );
};

export const getFileApi = async (
  ctx: ApiCtx,
  {
    path,
    thumbnail,
    preview,
    montageFrame,
    capture,
  }: {
    path: string;
    thumbnail?: true;
    preview?: true;
    montageFrame?: number;
    capture?: {
      start?: number;
      end?: number;
      type?: string;
      silent: boolean;
    };
  }
) => {
  const file = await ctx.library.getFile(path);
  if (!file) {
    throw new ClientError(404, "File not found");
  }

  if (capture) {
    if (!(file instanceof Video)) {
      throw new ClientError(400, "Capturing only supported on videos");
    }
    return await streamVideoCapture({
      ctx,
      video: file,
      ...capture,
    });
  }

  if (montageFrame) {
    // TODO UNIMPLEMENTED
    throw new ClientError(404, "No frame available");
  }

  if (preview) {
    if (!(file instanceof Video)) {
      throw new ClientError(400, "Previews only available for videos");
    }
    const previewFile = await file.previewFile();
    if (!previewFile) {
      throw new ClientError(404, "No preview available");
    }
    return new StreamFile(
      previewFile.absPath,
      previewFile.size,
      "video/mp4",
      file.fileName()
    );
  }

  if (thumbnail) {
    const thumbnailPath = await file.thumbnailPath();
    if (!thumbnailPath) {
      throw new ClientError(404, "No thumbnail available");
    }
    return new SendFile(thumbnailPath);
  }

  return new StreamFile(file.absPath, file.size, file.mime, file.fileName());
};
