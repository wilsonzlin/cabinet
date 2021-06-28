import {
  ffprobeAudioStream,
  ffprobeOutput,
  ffprobeVideoStream,
} from "@wzlin/ff";
import last from "extlib/js/last";
import pathExtension from "extlib/js/pathExtension";
import splitString from "extlib/js/splitString";
import fileType from "file-type";
import { readdir, stat } from "fs/promises";
import Mime from "mime";
import { basename, dirname, join, sep } from "path";
import sharp from "sharp";
import { ff } from "../util/ff";
import { MEDIA_EXTENSIONS, PHOTO_EXTENSIONS } from "./format";

// Consider:
// - HiDPI displays and zoomed-in viewports e.g. logical 180px is physical 360px.
// - Tile lists with awkward width where 2 columns can't fit so only 1 ultra-wide column is possible.
// - Bandwidth: a list of just 20 will require 20 x THUMB_SIZE network data and requests.
const PREVIEW_SCALED_WIDTH = 500;

export abstract class DirEntry {
  constructor(readonly absPath: string) {}
}

type DirEntries = { [name: string]: DirEntry };

export class Directory extends DirEntry {
  private lazyList: Promise<DirEntries> | undefined;

  entries(): Promise<DirEntries> {
    return (
      this.lazyList ??
      (async () => {
        const names = await readdir(this.absPath);
        const entries = Object.create(null);
        await Promise.all(
          names.map(async (f) => {
            const abs = join(this.absPath, f);
            let entry: DirEntry;
            const stats = await stat(abs);
            if (stats.isDirectory()) {
              entry = new Directory(abs);
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
                const probe = await ff.probe(this.absPath, false);
                const audio = probe.streams.find(
                  (s): s is ffprobeAudioStream => s.codec_type === "audio"
                );
                const video = probe.streams.find(
                  (s): s is ffprobeVideoStream => s.codec_type === "video"
                );
                if (video) {
                  entry = new Video(abs, stats.size, mime, probe, video, audio);
                } else if (audio) {
                  entry = new Audio(abs, stats.size, mime, probe, audio);
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
                entry = new Photo(abs, stats.size, mime, {
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
    absPath: string,
    readonly size: number,
    readonly mime: string
  ) {
    super(absPath);
  }

  protected dataDir() {
    return join(
      dirname(this.absPath),
      ".$Cabinet_data",
      basename(this.absPath)
    );
  }

  // Subclasses should lazy generate thumbnails and return the absolute path to the file.
  abstract thumbnailPath(): Promise<string>;
}

export class Photo extends File {
  private lazyThumbnailPath: Promise<string> | undefined;

  constructor(
    absPath: string,
    size: number,
    mime: string,
    private readonly metadata: {
      format: string;
      height: number;
      width: number;
    }
  ) {
    super(absPath, size, mime);
  }

  thumbnailPath() {
    return (
      this.lazyThumbnailPath ??
      (async () => {
        const thumbnailPath = join(this.dataDir(), "thumbnail.jpg");
        await sharp(this.absPath)
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
    absPath: string,
    size: number,
    mime: string,
    private readonly probe: ffprobeOutput
  ) {
    super(absPath, size, mime);
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
    absPath: string,
    size: number,
    mime: string,
    probe: ffprobeOutput,
    private readonly audioStream: ffprobeAudioStream
  ) {
    super(absPath, size, mime, probe);
  }

  channels() {
    return this.audioStream.channels;
  }

  thumbnailPath() {
    // TODO UNIMPLEMENTED.
    return Promise.resolve(join(this.dataDir(), "thumbnail.jpg"));
  }
}

export class Video extends Media {
  private lazyPreviewPath: Promise<string> | undefined;

  constructor(
    absPath: string,
    size: number,
    mime: string,
    probe: ffprobeOutput,
    private readonly videoStream: ffprobeVideoStream,
    private readonly audioStream?: ffprobeAudioStream
  ) {
    super(absPath, size, mime, probe);
  }

  thumbnailPath() {
    return (
      this.lazyPreviewPath ??
      (async () => {
        const thumbnailPath = join(this.dataDir(), "thumbnail.jpg");
        await ff.extractFrame({
          input: this.absPath,
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

  previewPath() {
    const previewPath = join(this.dataDir(), "preview.mp4");
    return (
      this.lazyPreviewPath ??
      (async () => {
        const PART_SEC = 3;
        const PARTS = 8;
        const chapterLen = this.duration() / PARTS;
        const parts = [];
        for (let i = 0; i < PARTS; i++) {
          const start = chapterLen * i + chapterLen / 2 - PART_SEC / 2;
          const end = start + PART_SEC;
          parts.push([start, end]);
        }
        await ff.convert({
          input: {
            file: this.absPath,
          },
          metadata: false,
          video: {
            codec: "libx264",
            movflags: ["faststart"],
            crf: 18,
            preset: "veryfast",
            resize: { width: PREVIEW_SCALED_WIDTH },
            filter: `select='${parts
              .map(([start, end]) => `between(t,${start},${end})`)
              .join("+")}',setpts=N/FRAME_RATE/TB`,
          },
          audio: false,
          output: {
            file: previewPath,
            format: "mp4",
          },
        });
        return previewPath;
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
