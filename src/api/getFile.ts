import assertExists from "@xtjs/lib/js/assertExists";
import mapDefined from "@xtjs/lib/js/mapDefined";
import maybeFileStats from "@xtjs/lib/js/maybeFileStats";
import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { Video } from "../library/model";
import { ClientError, Json, StreamFile } from "../server/response";
import { ff } from "../util/media";
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
    video.relPath,
    `capture.${start}-${end}.${type}${audio ? `` : `.silent`}`
  );
  await mkdir(dirname(outputFile), { recursive: true });
  let outputFileStats = await maybeFileStats(outputFile);
  if (!outputFileStats) {
    await ff.convert({
      input: {
        file: video.absPath(),
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
              crf: 18,
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
            },
      audio: type != "gif" && audio,
      output: {
        format: type == "gif" ? "gif" : "mp4",
        file: outputFile,
        movflags: ["faststart"],
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
    contentManifest,
    montageFrame,
    preview,
    segment,
    segmentGaplessMetadata,
    stream,
    thumbnail,
    capture,
  }: {
    path: string;
    contentManifest?: true;
    montageFrame?: number;
    preview?: true;
    segment?: { index: number; stream: "audio" | "video" };
    segmentGaplessMetadata?: number;
    stream?: "audio" | "video";
    thumbnail?: true;
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
      throw new ClientError(400, "Capturing is only supported on videos");
    }
    return await streamVideoCapture({
      ctx,
      video: file,
      ...capture,
    });
  }

  if (contentManifest) {
    if (!(file instanceof Video)) {
      throw new ClientError(
        400,
        "Content manifests are only available for videos"
      );
    }
    const content = await file.content.compute();
    const montageFrames = file.montage.map((m) => m.time);
    if ("absPath" in content) {
      return new Json({
        type: "src",
        montageFrames,
      });
    }
    return new Json({
      type: "mse",
      montageFrames,
      audio: mapDefined(content.audio, (a) => (a.file ? "file" : "segments")),
      video: content.video.file ? "file" : "segments",
      segments: content.segments,
    });
  }

  if (montageFrame != undefined) {
    if (!(file instanceof Video)) {
      throw new ClientError(
        400,
        "Montage frames are only available for videos"
      );
    }
    const frame = await file.montage
      .find((f) => f.time === montageFrame)
      ?.file.compute();
    if (!frame) {
      throw new ClientError(404, "Frame not found");
    }
    return new StreamFile(frame.absPath, frame.size);
  }

  if (preview) {
    if (!(file instanceof Video)) {
      throw new ClientError(400, "Previews only available for videos");
    }
    const previewFile = await file.preview.compute();
    if (!previewFile) {
      throw new ClientError(404, "No preview available");
    }
    return new StreamFile(previewFile.absPath, previewFile.size, "video/mp4");
  }

  if (segment != undefined) {
    if (!(file instanceof Video)) {
      throw new ClientError(400, "Segments only available for videos");
    }
    const content = await file.content.compute();
    if ("absPath" in content) {
      throw new ClientError(404, "Video does not have segments");
    }
    const stream = content[segment.stream];
    const s = stream?.segments?.[segment.index];
    if (!s) {
      throw new ClientError(404, "Segment not found");
    }
    const f = await s.file.compute();
    return new StreamFile(f.absPath, f.size);
  }

  if (segmentGaplessMetadata != undefined) {
    if (!(file instanceof Video)) {
      throw new ClientError(400, "Segments only available for videos");
    }
    const content = await file.content.compute();
    if ("absPath" in content) {
      throw new ClientError(404, "Video does not have segments");
    }
    const s = content.audio?.segments?.[segmentGaplessMetadata];
    if (!s) {
      throw new ClientError(404, "Segment not found");
    }
    const f = await s.file.compute();
    return new Json({
      gaplessMetadata: f.gaplessMetadata,
    });
  }

  if (stream) {
    if (!(file instanceof Video)) {
      throw new ClientError(400, "Segments only available for videos");
    }
    const content = await file.content.compute();
    if ("absPath" in content) {
      throw new ClientError(404, "Video does not have separate streams");
    }
    const s = await content[stream]?.file?.compute();
    if (!s) {
      throw new ClientError(404, "Stream not available");
    }
    return new StreamFile(s.absPath, s.size, `${stream}/mp4`);
  }

  if (thumbnail) {
    const thumbnailMeta = await file.thumbnail.compute();
    if (!thumbnailMeta) {
      throw new ClientError(404, "No thumbnail available");
    }
    return new StreamFile(thumbnailMeta.absPath, thumbnailMeta.size);
  }

  if (file instanceof Video) {
    const content = await file.content.compute();
    if (!("absPath" in content)) {
      throw new ClientError(404, "Video must be accessed via segments");
    }
    return new StreamFile(content.absPath, content.size);
  }
  return new StreamFile(file.absPath(), file.size);
};
