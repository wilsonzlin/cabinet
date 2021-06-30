import {
  ffprobeAudioStream,
  ffprobeFormat,
  ffprobeOutput,
  ffprobeVideoStream,
} from "@wzlin/ff";
import assertExists from "extlib/js/assertExists";
import exec from "extlib/js/exec";
import last from "extlib/js/last";
import mapDefined from "extlib/js/mapDefined";
import pathExtension from "extlib/js/pathExtension";
import splitString from "extlib/js/splitString";
import { mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import { EOL } from "os";
import { basename, dirname, join, sep } from "path";
import sharp from "sharp";
import { ComputedFile, computedFile, fileMime, LazyP } from "../util/fs";
import { ff, GaplessMetadata, parseGaplessMetadata } from "../util/media";
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

const dataDirForFile = (absPath: string) =>
  join(dirname(absPath), DATA_DIR_NAME, basename(absPath));

const ensureDataDirForFile = async (absPath: string) => {
  const dir = dataDirForFile(absPath);
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
              let probeDataPath = join(
                await ensureDataDirForFile(abs),
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
              await ensureDataDirForFile(abs);
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

  protected dataDir() {
    return dataDirForFile(this.absPath());
  }

  abstract readonly thumbnail: LazyP<ComputedFile>;
}

export class Photo extends File {
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

  readonly thumbnail = new LazyP(() =>
    computedFile(
      join(this.dataDir(), "thumbnail.jpg"),
      (thumbnailPath) =>
        sharp(this.absPath())
          .resize({
            width: PREVIEW_SCALED_WIDTH,
          })
          .jpeg()
          .toFile(thumbnailPath),
      "Failed to generate photo thumbnail"
    )
  );

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

  thumbnail = new LazyP(() =>
    computedFile(
      join(this.dataDir(), "waveform.png"),
      (waveformAbsPath) =>
        // https://trac.ffmpeg.org/wiki/Waveform.
        exec(
          "ffmpeg",
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-nostdin",
          "-i",
          this.absPath(),
          "-filter_complex",
          `aformat=channel_layouts=stereo,showwavespic=s=${PREVIEW_SCALED_WIDTH}x${PREVIEW_SCALED_WIDTH}`,
          "-frames:v",
          "1",
          waveformAbsPath
        ).status(),
      "Failed to generate audio waveform"
    )
  );
}

export class Video extends Media {
  readonly content = new LazyP<
    | ComputedFile
    | {
        video: {
          segments: {
            start: number;
            file: LazyP<ComputedFile>;
          }[];
        };
        audio?: {
          segments: {
            start: number;
            file: LazyP<
              ComputedFile & { gaplessMetadata: GaplessMetadata | undefined }
            >;
          }[];
        };
      }
  >(async () => {
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
      (audioCodec == undefined || containerConfig?.audioCodecs.has(audioCodec));
    if (
      containerSupported &&
      videoSupported &&
      audioSupported &&
      containerSupportsAV
    ) {
      return { absPath: this.absPath(), mime: this.mime, size: this.size };
    }

    if (videoSupported && audioSupported) {
      const convertedContainer = findSuitableContainer(videoCodec, audioCodec);
      // If no suitable container found for existing video and audio codec, we can only transcode.
      if (convertedContainer != undefined) {
        return await computedFile(
          join(this.dataDir(), "converted"),
          async (incompleteAbsPath) => {
            await ff.convert({
              input: {
                file: this.absPath(),
              },
              metadata: false,
              audio: true,
              video: true,
              output: {
                file: incompleteAbsPath,
                format: convertedContainer,
              },
            });
          },
          "Failed to convert video to different container"
        );
      }
    }

    // Don't probe and use keyframes:
    // - Not consistent in duration between.
    // - Some broken and old formats don't have any or have extremely long durations between.
    // - Probing is slow and causes head-of-line blocking (i.e. probing entire file delays streaming even first few segments).
    const SEGMENT_DUR = 10;
    const keyframesMajor = [0];
    for (
      let ts = SEGMENT_DUR;
      ts < this.duration() - SEGMENT_DUR;
      ts += SEGMENT_DUR
    ) {
      keyframesMajor.push(ts);
    }
    return {
      audio: {
        segments: keyframesMajor.map((ts, i, a) => {
          const nextTs: number | undefined = a[i + 1];
          return {
            start: ts,
            file: new LazyP(async () => {
              // This is result of several facts:
              // - Audio conversion is not fast enough to do entire file at once, especially for super long videos.
              // - Uncompressed audio codecs will take up significantly more space (think 10x instead of 10%).
              // - Compressed audio have padded silence at start and end that will cause noticeable skips/stutters during concatenated playback of segments.
              // - AAC can store padding metadata in MP4/M4A container format (but not AAC container).
              // - ffmpeg (as of 2021-06-30) cannot place this info in the container.
              // - fdkaac (a CLI for a superior AAC codec) can when container format chosen is M4A.
              // - The MIME specified to MediaSource must be audio/mp4, not audio/x-m4a. See official W3C spec for supported formats: https://www.w3.org/TR/mse-byte-stream-format-registry/#registry. For more details, see https://developer.mozilla.org/en-US/docs/Web/Media/Formats/codecs_parameter.
              //   - Additionally, a codec string must be provided on Chrome-like browsers. This can be sourced using mp4info, part of Bento4.
              //   - Notice: spec says FLAC and WAV are not supported.
              // TODO There is another gapless metadata format stored in edge + sgpd that is worth investigating to see if this flow can be simplified. See https://www.mail-archive.com/ffmpeg-devel@ffmpeg.org/msg95677.html.
              let gaplessMetadata: GaplessMetadata | undefined;
              const rawFile = await computedFile(
                join(this.dataDir(), `converted.audio.segment.${i}.raw`),
                (out) =>
                  ff.convert({
                    input: {
                      file: this.absPath(),
                      start: ts,
                      // We extract slightly more than necessary to avoid errors and stutters
                      // with minor gaps between segments during playback due to
                      // rounding/precision, gapless metadata, etc.
                      end: mapDefined(nextTs, (ts) => ts + 1),
                    },
                    video: false,
                    audio: {
                      codec: "pcm",
                      bits: 24,
                      signedness: "s",
                      endianness: "le",
                    },
                    metadata: false,
                    output: {
                      format: "wav",
                      file: out,
                    },
                  }),
                "Failed to convert video audio segment to WAV"
              );
              const fdkFile = await computedFile(
                join(this.dataDir(), `converted.audio.segment.${i}.fdk`),
                (out) =>
                  exec(
                    "fdkaac",
                    "-b",
                    192000,
                    "-f",
                    0,
                    "-G",
                    2,
                    "-o",
                    out,
                    rawFile.absPath
                  ).status(),
                "Failed to convert video audio segment using fdkaac"
              );
              const probe = await ff.probe(fdkFile.absPath);
              const sampleRate = +assertExists(
                probe.streams.find(
                  (s): s is ffprobeAudioStream => s.codec_type == "audio"
                )
              ).sample_rate;
              gaplessMetadata = parseGaplessMetadata(
                await readFile(fdkFile.absPath, "utf8"),
                sampleRate
              );
              const finalFile = await computedFile(
                join(this.dataDir(), `converted.audio.segment.${i}`),
                (out) =>
                  ff.convert({
                    input: {
                      file: fdkFile.absPath,
                    },
                    metadata: false,
                    output: {
                      file: out,
                      format: "mp4",
                      // See video segment code for more info.
                      movflags: ["default_base_moof", "empty_moov"],
                    },
                  }),
                "Failed to set movflags on video audio segment"
              );
              return {
                ...finalFile,
                gaplessMetadata,
              };
            }),
          };
        }),
      },
      video: {
        segments: keyframesMajor.map((ts, i, a) => {
          const nextTs: number | undefined = a[i + 1];
          return {
            start: ts,
            file: new LazyP(async () => {
              return await computedFile(
                join(this.dataDir(), `converted.video.segment.${i}`),
                async (segmentAbsPath) => {
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
                    },
                    audio: false,
                    metadata: false,
                    output: {
                      // https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API/Transcoding_assets_for_MSE.
                      movflags: ["default_base_moof", "empty_moov"],
                      format: "mp4",
                      file: segmentAbsPath,
                    },
                  });
                },
                "Failed to transcode video segment"
              );
            }),
          };
        }),
      },
    };
  });

  readonly thumbnail = new LazyP<ComputedFile>(() =>
    computedFile(
      join(this.dataDir(), "thumbnail.jpg"),
      (thumbnailPath) =>
        ff.extractFrame({
          input: this.absPath(),
          output: thumbnailPath,
          timestamp: this.duration() * 0.5,
          scaleWidth: PREVIEW_SCALED_WIDTH,
        }),
      "Failed to generate video thumbnail"
    )
  );

  readonly preview = new LazyP<ComputedFile>(() =>
    computedFile(
      join(this.dataDir(), "preview.mp4"),
      async (previewPath) => {
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
          partFiles.push(`file '${partFile.replaceAll("'", "'\\''")}'${EOL}`);
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
                crf: 23,
                fps: 24,
                preset: "veryfast",
                resize: { width: PREVIEW_SCALED_WIDTH },
              },
              audio: false,
              output: {
                file: partFile,
                format: "mp4",
                movflags: ["faststart"],
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
      },
      "Failed to generate video preview"
    )
  );

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
