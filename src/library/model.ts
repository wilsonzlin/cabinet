import {
  ffprobeAudioStream,
  ffprobeOutput,
  ffprobeVideoStream,
} from "@wzlin/ff";
import { execFile } from "child_process";
import last from "extlib/js/last";
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
import { MEDIA_EXTENSIONS, PHOTO_EXTENSIONS } from "./format";

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
    return (
      this.lazyList ??
      (async () => {
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
              // "file-type" uses magic bytes, but doesn't detect every file type,
              // so fall back to simple extension lookup via "mime".
              const mime =
                (await fileType.fromFile(abs))?.mime ?? Mime.getType(abs);
              if (!mime) {
                return;
              }
              const ext = pathExtension(f) ?? "";
              if (MEDIA_EXTENSIONS.has(ext)) {
                let probeDataPath = join(
                  await dataDirForFile(abs),
                  "probe.json"
                );
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
                    probe,
                    video,
                    audio
                  );
                } else if (audio) {
                  entry = new Audio(
                    this.rootAbsPath,
                    rel,
                    stats.size,
                    mime,
                    probe,
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
      })()
    );
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
    return (
      this.lazyThumbnailPath ??
      (async () => {
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
      })()
    );
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
    private readonly probe: ffprobeOutput
  ) {
    super(rootAbsPath, relPath, size, mime);
  }

  duration() {
    return Number(this.probe.format.duration);
  }

  // Many videos also use the same standard audio metadata tags.
  metadata(): {
    artist?: string;
    album?: string;
    genre?: string;
    title?: string;
    track?: number;
  } {
    return this.probe.format.tags;
  }
}

export class Audio extends Media {
  constructor(
    rootAbsPath: string,
    relPath: string,
    size: number,
    mime: string,
    probe: ffprobeOutput,
    private readonly audioStream: ffprobeAudioStream
  ) {
    super(rootAbsPath, relPath, size, mime, probe);
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
  private lazyThumbnailPath: Promise<string> | undefined;
  private lazyPreviewPath:
    | Promise<{ absPath: string; size: number }>
    | undefined;

  constructor(
    rootAbsPath: string,
    relPath: string,
    size: number,
    mime: string,
    probe: ffprobeOutput,
    private readonly videoStream: ffprobeVideoStream,
    private readonly audioStream?: ffprobeAudioStream
  ) {
    super(rootAbsPath, relPath, size, mime, probe);
  }

  thumbnailPath() {
    return (
      this.lazyThumbnailPath ??
      (async () => {
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
      })()
    );
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
    return (
      this.lazyPreviewPath ??
      (async () => {
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
          // TODO Integrate with ff.
          await new Promise<void>((resolve, reject) =>
            execFile(
              "ffmpeg",
              [
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                partFilesListFile,
                "-c",
                "copy",
                previewPath,
              ],
              (error) => (error ? reject(error) : resolve())
            )
          );
          stats = await stat(previewPath);
        }
        return { absPath: previewPath, size: stats.size };
      })()
    );
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
