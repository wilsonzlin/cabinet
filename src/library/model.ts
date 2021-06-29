import {
  ffprobeAudioStream,
  ffprobeFormat,
  ffprobeOutput,
  ffprobeVideoStream,
} from "@wzlin/ff";
import assertExists from "extlib/js/assertExists";
import last from "extlib/js/last";
import mapDefined from "extlib/js/mapDefined";
import maybeFileStats from "extlib/js/maybeFileStats";
import pathExtension from "extlib/js/pathExtension";
import splitString from "extlib/js/splitString";
import fileType from "file-type";
import { Stats } from "fs";
import { mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import Mime from "mime";
import { EOL } from "os";
import { basename, dirname, join, sep } from "path";
import sharp from "sharp";
import { ff } from "../util/ff";
import {
  BROWSER_SUPPORTED_AUDIO_CODECS,
  BROWSER_SUPPORTED_MEDIA_CONTAINER_FORMATS,
  BROWSER_SUPPORTED_VIDEO_CODECS,
  findSuitableContainer,
  MEDIA_EXTENSIONS,
  PHOTO_EXTENSIONS,
} from "./format";

// Consider:
// - HiDPI displays and zoomed-in viewports e.g. logical 180px is physical 360px.
// - Tile lists with awkward width where 2 columns can't fit so only 1 ultra-wide column is possible.
// - Bandwidth: a list of just 20 will require 20 x THUMB_SIZE network data and requests.
const PREVIEW_SCALED_WIDTH = 500;

const DATA_DIR_NAME = ".$Cabinet_data";

const dataDirForFile = async (absPath: string) => {
  const dir = join(dirname(absPath), DATA_DIR_NAME, basename(absPath));
  await mkdir(dir, { recursive: true });
  return dir;
};

const fileMime = async (absPath: string) => {
  // "file-type" uses magic bytes, but doesn't detect every file type,
  // so fall back to simple extension lookup via "mime".
  return (await fileType.fromFile(absPath))?.mime ?? Mime.getType(absPath);
};

export abstract class DirEntry {
  constructor(readonly rootAbsPath: string, readonly relPath: string) {}

  absPath() {
    return join(this.rootAbsPath, this.relPath);
  }

  fileName() {
    return basename(this.relPath);
  }
}

type DirEntries = { [name: string]: DirEntry };

export class Directory extends DirEntry {
  private lazyList: Promise<DirEntries> | undefined;

  entries(): Promise<DirEntries> {
    return (this.lazyList ??= (async () => {
      const names = await readdir(this.absPath());
      const entries = Object.create(null);
      await Promise.all(
        names.map(async (f) => {
          if (f == DATA_DIR_NAME) {
            return;
          }
          const abs = join(this.absPath(), f);
          const rel = join(this.relPath, f);
          let entry: DirEntry;
          const stats = await stat(abs);
          if (stats.isDirectory()) {
            entry = new Directory(this.rootAbsPath, rel);
          } else if (stats.isFile()) {
            const mime = await fileMime(abs);
            if (!mime) {
              return;
            }
            const ext = pathExtension(f) ?? "";
            if (MEDIA_EXTENSIONS.has(ext)) {
              let probeDataPath = join(await dataDirForFile(abs), "probe.json");
              let probe: ffprobeOutput;
              try {
                probe = JSON.parse(await readFile(probeDataPath, "utf8"));
              } catch (e) {
                if (e.code !== "ENOENT") {
                  throw e;
                }
                probe = await ff.probe(abs, false);
                await writeFile(probeDataPath, JSON.stringify(probe));
              }
              const audio = probe.streams.find(
                (s): s is ffprobeAudioStream => s.codec_type === "audio"
              );
              const video = probe.streams.find(
                (s): s is ffprobeVideoStream => s.codec_type === "video"
              );
              if (video) {
                entry = new Video(
                  this.rootAbsPath,
                  rel,
                  stats.size,
                  mime,
                  probe.format,
                  video,
                  audio
                );
              } else if (audio) {
                entry = new Audio(
                  this.rootAbsPath,
                  rel,
                  stats.size,
                  mime,
                  probe.format,
                  audio
                );
              } else {
                return;
              }
            } else if (PHOTO_EXTENSIONS.has(ext)) {
              let metadata;
              try {
                metadata = await sharp(abs).metadata();
              } catch {
                return;
              }
              const { format, height, width } = metadata;
              if (
                format == undefined ||
                height == undefined ||
                width == undefined
              ) {
                return;
              }
              entry = new Photo(this.rootAbsPath, rel, stats.size, mime, {
                format,
                height,
                width,
              });
            } else {
              return;
            }
          } else {
            return;
          }
          entries[f] = entry;
        })
      );
      return entries;
    })());
  }
}

export abstract class File extends DirEntry {
  protected constructor(
    rootAbsPath: string,
    relPath: string,
    readonly size: number,
    readonly mime: string
  ) {
    super(rootAbsPath, relPath);
  }

  protected async dataDir() {
    return await dataDirForFile(this.absPath());
  }

  // Subclasses should lazy generate thumbnails and return the absolute path to the file.
  abstract thumbnailPath(): Promise<string>;
}

export class Photo extends File {
  private lazyThumbnailPath: Promise<string> | undefined;

  constructor(
    rootAbsPath: string,
    relPath: string,
    size: number,
    mime: string,
    private readonly metadata: {
      format: string;
      height: number;
      width: number;
    }
  ) {
    super(rootAbsPath, relPath, size, mime);
  }

  thumbnailPath() {
    return (this.lazyThumbnailPath ??= (async () => {
      const thumbnailPath = join(await this.dataDir(), "thumbnail.jpg");
      if (await maybeFileStats(thumbnailPath)) {
        return thumbnailPath;
      }
      await sharp(this.absPath())
        .resize({
          width: PREVIEW_SCALED_WIDTH,
        })
        .jpeg()
        .toFile(thumbnailPath);
      return thumbnailPath;
    })());
  }

  height() {
    return this.metadata.height;
  }

  width() {
    return this.metadata.width;
  }

  format() {
    return this.metadata.format;
  }
}

export abstract class Media extends File {
  protected constructor(
    rootAbsPath: string,
    relPath: string,
    size: number,
    mime: string,
    protected readonly format: ffprobeFormat
  ) {
    super(rootAbsPath, relPath, size, mime);
  }

  duration() {
    return Number(this.format.duration);
  }

  // Many videos also use the same standard audio metadata tags.
  metadata(): {
    artist?: string;
    album?: string;
    genre?: string;
    title?: string;
    track?: number;
  } {
    return this.format.tags ?? {};
  }
}

export class Audio extends Media {
  constructor(
    rootAbsPath: string,
    relPath: string,
    size: number,
    mime: string,
    format: ffprobeFormat,
    private readonly audioStream: ffprobeAudioStream
  ) {
    super(rootAbsPath, relPath, size, mime, format);
  }

  channels() {
    return this.audioStream.channels;
  }

  async thumbnailPath() {
    // TODO UNIMPLEMENTED.
    return join(await this.dataDir(), "thumbnail.jpg");
  }
}

export class Video extends Media {
  private lazyContent:
    | Promise<
        | {
            absPath: string;
            mime: string;
            size: number;
          }
        | {
            video: {
              segments: readonly {
                readonly start: number;
                file(): Promise<{
                  absPath: string;
                  mime: string;
                  size: number;
                }>;
              }[];
            };
            audio?: {
              absPath: string;
              mime: string;
              size: number;
            };
          }
      >
    | undefined;
  private lazyThumbnailPath: Promise<string> | undefined;
  private lazyPreviewPath:
    | Promise<{ absPath: string; size: number }>
    | undefined;

  constructor(
    rootAbsPath: string,
    relPath: string,
    size: number,
    mime: string,
    format: ffprobeFormat,
    private readonly videoStream: ffprobeVideoStream,
    private readonly audioStream?: ffprobeAudioStream
  ) {
    super(rootAbsPath, relPath, size, mime, format);
  }

  content() {
    return (this.lazyContent ??= (async () => {
      const container = this.format.format_name;
      const videoCodec = this.videoStream.codec_name;
      const audioCodec = this.audioStream?.codec_name;
      const containerConfig =
        BROWSER_SUPPORTED_MEDIA_CONTAINER_FORMATS.get(container);
      const containerSupported = !!containerConfig;
      const videoSupported = BROWSER_SUPPORTED_VIDEO_CODECS.has(videoCodec);
      const audioSupported =
        mapDefined(audioCodec, (c) => BROWSER_SUPPORTED_AUDIO_CODECS.has(c)) ??
        true;
      const containerSupportsAV =
        containerConfig?.videoCodecs.has(videoCodec) &&
        (audioCodec == undefined ||
          containerConfig?.audioCodecs.has(audioCodec));
      if (
        containerSupported &&
        videoSupported &&
        audioSupported &&
        containerSupportsAV
      ) {
        return { absPath: this.absPath(), mime: this.mime, size: this.size };
      }
      // Audio conversion is very quick. Also, segmenting audio is very difficult to get right
      // without skips/stutters between segments. For both reasons, we always convert any audio
      // in entirety directly.
      if (videoSupported) {
        let convertedAudioCodec = audioSupported ? audioCodec : "aac";
        let convertedContainer = findSuitableContainer(
          videoCodec,
          convertedAudioCodec
        );
        // If no suitable container found for existing video and audio codec, opt to convert audio.
        for (const audioCodec of BROWSER_SUPPORTED_AUDIO_CODECS) {
          if (convertedContainer != undefined) {
            break;
          }
          convertedAudioCodec = audioCodec;
          convertedContainer = findSuitableContainer(
            videoCodec,
            convertedAudioCodec
          );
        }
        // If still no suitable container found for video codec, we can only convert the video.
        if (convertedContainer != undefined) {
          const convertedPath = join(await this.dataDir(), "converted");
          let convertedStats;
          if (!(convertedStats = await maybeFileStats(convertedPath))) {
            await ff.convert({
              input: {
                file: this.absPath(),
              },
              metadata: false,
              audio: !audioCodec
                ? false
                : convertedAudioCodec === audioCodec
                ? true
                : { codec: convertedAudioCodec as any },
              video: true,
              output: {
                file: convertedPath,
                format: convertedContainer,
              },
            });
            convertedStats = await stat(convertedPath);
          }
          return {
            absPath: convertedPath,
            mime: assertExists(
              await fileMime(convertedPath),
              "converted video has no MIME"
            ),
            size: convertedStats.size,
          };
        }
      }
      let convertAudioPromise: Promise<unknown> | undefined;
      let convertedAudioPath: string | undefined;
      let convertedAudioStats: Stats | undefined;
      if (audioCodec != undefined) {
        convertedAudioPath = join(await this.dataDir(), "converted.audio");
        if (!(convertedAudioStats = await maybeFileStats(convertedAudioPath))) {
          convertAudioPromise = ff
            .convert({
              input: {
                file: this.absPath(),
              },
              metadata: false,
              audio: { codec: "aac" },
              video: false,
              output: {
                file: convertedAudioPath,
                format: "adts",
              },
            })
            .then(
              async () =>
                (convertedAudioStats = await stat(convertedAudioPath!))
            );
        }
      }
      const [keyframes] = await Promise.all([
        ff.getKeyframeTimestamps(this.absPath(), false),
        convertAudioPromise,
      ]);
      const keyframesMajor = [0];
      for (const ts of keyframes) {
        // Ensure segments are at least 9 seconds apart and not within last 9 seconds of video.
        if (ts - last(keyframesMajor) >= 9 && this.duration() - ts >= 9) {
          keyframesMajor.push(ts);
        }
      }
      return {
        audio: await mapDefined(convertedAudioPath, async (absPath) => ({
          absPath,
          mime: assertExists(
            await fileMime(absPath),
            "converted video audio has no MIME"
          ),
          size: assertExists(convertedAudioStats).size,
        })),
        video: {
          segments: keyframesMajor.map((ts, i, a) => {
            let lazyAbsPath:
              | Promise<{
                  absPath: string;
                  mime: string;
                  size: number;
                }>
              | undefined;
            const nextTs: number | undefined = a[i + 1];
            return {
              start: ts,
              file: () => {
                return (lazyAbsPath ??= (async () => {
                  const segmentAbsPath = join(
                    await this.dataDir(),
                    `converted.video.segment.${i}`
                  );
                  let stats;
                  if (!(stats = await maybeFileStats(segmentAbsPath))) {
                    await ff.convert({
                      input: {
                        file: this.absPath(),
                        start: ts,
                        end: nextTs,
                      },
                      video: {
                        codec: "libx264",
                        preset: "veryfast",
                        crf: 18,
                        movflags: ["default_base_moof", "empty_moov"],
                      },
                      audio: false,
                      metadata: false,
                      output: {
                        format: "mp4",
                        file: segmentAbsPath,
                      },
                    });
                    stats = await stat(segmentAbsPath);
                  }
                  return {
                    absPath: segmentAbsPath,
                    mime: assertExists(
                      await fileMime(segmentAbsPath),
                      "video segment has no MIME"
                    ),
                    size: stats.size,
                  };
                })());
              },
            };
          }),
        },
      };
    })());
  }

  thumbnailPath() {
    return (this.lazyThumbnailPath ??= (async () => {
      const thumbnailPath = join(await this.dataDir(), "thumbnail.jpg");
      if (await maybeFileStats(thumbnailPath)) {
        return thumbnailPath;
      }
      await ff.extractFrame({
        input: this.absPath(),
        output: thumbnailPath,
        timestamp: this.duration() * 0.5,
        scaleWidth: PREVIEW_SCALED_WIDTH,
      });
      return thumbnailPath;
    })());
  }

  fps() {
    const [num, denom] = splitString(this.videoStream.r_frame_rate, "/", 2).map(
      (n) => Number.parseInt(n, 10)
    );
    return num / denom;
  }

  height() {
    return this.videoStream.height;
  }

  width() {
    return this.videoStream.width;
  }

  hasAudio() {
    return !!this.audioStream;
  }

  previewFile() {
    return (this.lazyPreviewPath ??= (async () => {
      const previewPath = join(await this.dataDir(), "preview.mp4");
      let stats: Stats;
      if (!(stats = await maybeFileStats(previewPath))) {
        const PART_SEC = 3;
        const PARTS = 8;
        const chapterLen = this.duration() / PARTS;
        const partFiles = [];
        const partFilesListFile = `${previewPath}.parts.txt`;
        const promises: Promise<void>[] = [];
        // Using the ffmpeg select filter is excruciatingly slow for a tiny < 1 minute output.
        // Manually seek and extract in parallel, and stitch at end.
        for (let i = 0; i < PARTS; i++) {
          const partFile = `${previewPath}.${i}`;
          partFiles.push(`file '${partFile}'${EOL}`);
          const start = chapterLen * i + chapterLen / 2 - PART_SEC / 2;
          promises.push(
            ff.convert({
              input: {
                file: this.absPath(),
                start,
                duration: PART_SEC,
              },
              metadata: false,
              video: {
                codec: "libx264",
                movflags: ["faststart"],
                crf: 23,
                fps: 24,
                preset: "veryfast",
                resize: { width: PREVIEW_SCALED_WIDTH },
              },
              audio: false,
              output: {
                file: partFile,
                format: "mp4",
              },
            })
          );
        }
        promises.push(writeFile(partFilesListFile, partFiles.join("")));
        await Promise.all(promises);
        await ff.concat({
          filesListFile: partFilesListFile,
          output: previewPath,
        });
        stats = await stat(previewPath);
      }
      return { absPath: previewPath, size: stats.size };
    })());
  }
}

export class Library {
  constructor(private readonly root: Directory) {}

  async getDirectory(path: string[]): Promise<Directory | undefined> {
    let cur: Directory = this.root;
    for (const component of path) {
      const entries = await cur.entries();
      const entry = entries[component];
      if (!(entry instanceof Directory)) {
        return undefined;
      }
      cur = entry;
    }
    return cur;
  }

  async getFile(path: string): Promise<File | undefined> {
    const pathComponents = splitString(path, sep);
    const dir = await this.getDirectory(pathComponents.slice(0, -1));
    const entries = await dir?.entries();
    const entry = entries?.[last(pathComponents)];
    return entry instanceof File ? entry : undefined;
  }
}
