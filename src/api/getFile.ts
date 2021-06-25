import assertExists from "extlib/js/assertExists";
import defined from "extlib/js/defined";
import maybeFileStats from "extlib/js/maybeFileStats";
import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { DirEntryType, Video } from "../library/model";
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
  type: string;
  silent: boolean;
}) => {
  const { scratch } = ctx;
  if (!scratch) {
    throw new ClientError(404, "No scratch directory available");
  }

  if (
    start == undefined ||
    start < 0 ||
    start > video.duration ||
    end == undefined ||
    end < 0 ||
    end > video.duration
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
  }[type];
  if (!mime) {
    throw new ClientError(400, "Invalid type");
  }

  const audio = type != "gif" && !silent;

  const outputFile = join(
    scratch,
    video.relativePath,
    `capture.${start}-${end}.${type}${audio ? `` : `.silent`}`
  );
  await mkdir(dirname(outputFile), { recursive: true });
  let outputFileStats = await maybeFileStats(outputFile);
  if (!outputFileStats) {
    await ff.convert({
      input: {
        file: video.absolutePath,
        start,
        duration,
      },
      metadata: false,
      video:
        type == "gif"
          ? {
              codec: "gif",
              loop: true,
              fps: Math.min(10, video.fps),
              resize: { width: Math.min(800, video.width) },
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
                video.fps
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
                  video.width
                ),
              },
              faststart: true,
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
    `${video.name} (capture ${duration}s, ${type}${audio ? "" : ", silent"})`
  );
};

export const getFileApi = async (
  ctx: ApiCtx,
  {
    path,
    thumbnail,
    snippet,
    montageFrame,
    start,
    end,
    type,
    silent,
  }: {
    path: string;
    thumbnail?: boolean;
    snippet?: boolean;
    montageFrame?: number;
    start?: number;
    end?: number;
    type?: string;
    silent: boolean;
  }
) => {
  const file = ctx.library.getFile(path);
  switch (file?.type) {
    case DirEntryType.PHOTO:
      return new SendFile(file.absolutePath);

    case DirEntryType.VIDEO:
      switch (true) {
        case thumbnail:
          const thumbnailPath = file.preview?.thumbnailPath;
          if (!thumbnailPath) {
            throw new ClientError(404, "No thumbnail available");
          }
          return new SendFile(thumbnailPath);

        case snippet:
          const snippetMeta = file.preview?.snippet;
          if (!snippetMeta) {
            throw new ClientError(404, "No snippet available");
          }
          return new StreamFile(
            snippetMeta.path,
            snippetMeta.size,
            "video/mp4",
            file.name
          );

        case defined(montageFrame):
          const mfPath = file.preview?.montageFrames[montageFrame as any];
          if (!mfPath) {
            throw new ClientError(404, "No frame available");
          }
          return new SendFile(mfPath);

        case defined(start):
        case defined(end):
          return await streamVideoCapture({
            ctx,
            video: file,
            start,
            end,
            type: type || "",
            silent,
          });

        default:
          return new StreamFile(
            file.absolutePath,
            file.size,
            file.mime,
            file.name
          );
      }

    case undefined:
      throw new ClientError(404, "File not found");
  }
};
