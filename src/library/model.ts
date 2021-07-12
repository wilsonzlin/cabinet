import {
  ffprobeAudioStream,
  ffprobeFormat,
  ffprobeOutput,
  ffprobeVideoStream,
} from "@wzlin/ff";
import assertExists from "@xtjs/lib/js/assertExists";
import exec from "@xtjs/lib/js/exec";
import last from "@xtjs/lib/js/last";
import map from "@xtjs/lib/js/map";
import mapDefined from "@xtjs/lib/js/mapDefined";
import numberGenerator from "@xtjs/lib/js/numberGenerator";
import pathExtension from "@xtjs/lib/js/pathExtension";
import splitString from "@xtjs/lib/js/splitString";
import { mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import { DateTime } from "luxon";
import { EOL } from "os";
import { basename, dirname, join, sep } from "path";
import sharp from "sharp";
import { ComputedFile, computedFile, getFileMetadata, LazyP } from "../util/fs";
import {
  ff,
  GaplessMetadata,
  parseGaplessMetadata,
  queue,
} from "../util/media";
import {
  BROWSER_SUPPORTED_MEDIA_CONTAINER_FORMATS,
  findSuitableContainer,
  MEDIA_EXTENSIONS,
  MSE_SUPPORTED_AUDIO_CODECS,
  MSE_SUPPORTED_VIDEO_CODECS,
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

export class Directory extends DirEntry {
  entries = new LazyP(async () => {
    const names = await readdir(this.absPath());
    const entries: { [name: string]: DirEntry } = Object.create(null);
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
          const modified = DateTime.fromMillis(stats.mtimeMs);
          const ext = pathExtension(f) ?? "";
          if (MEDIA_EXTENSIONS.has(ext)) {
            let probeDataPath = join(
              await ensureDataDirForFile(abs),
              "probe.json"
            );
            let probe: ffprobeOutput;
            try {
              probe = JSON.parse(await readFile(probeDataPath, "utf8"));
            } catch {
              try {
                probe = await ff.probe(abs);
              } catch (e) {
                console.warn(`Failed to probe ${abs}: ${e}`);
                // Invalid file.
                return;
              }
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
                modified,
                probe.format,
                video,
                audio
              );
            } else if (audio) {
              entry = new Audio(
                this.rootAbsPath,
                rel,
                stats.size,
                modified,
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
            entry = new Photo(this.rootAbsPath, rel, stats.size, modified, {
              hasAlphaChannel: metadata.hasAlpha,
              channels: metadata.channels,
              chromaSubsampling: metadata.chromaSubsampling,
              colourSpace: metadata.space,
              dpi: metadata.density,
              format,
              hasIccProfile: metadata.hasProfile,
              height,
              isProgressive: metadata.isProgressive,
              orientation: metadata.orientation,
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
  });
}

export abstract class File extends DirEntry {
  abstract readonly thumbnail: LazyP<ComputedFile | undefined>;

  protected constructor(
    rootAbsPath: string,
    relPath: string,
    readonly size: number,
    readonly modified: DateTime
  ) {
    super(rootAbsPath, relPath);
  }

  protected dataDir() {
    return dataDirForFile(this.absPath());
  }
}

export class Photo extends File {
  readonly thumbnail = new LazyP(() =>
    computedFile(join(this.dataDir(), "thumbnail.jpg"), (thumbnailPath) =>
      queue.add(() =>
        sharp(this.absPath())
          .resize({
            fastShrinkOnLoad: true,
            width: PREVIEW_SCALED_WIDTH,
            withoutEnlargement: true,
          })
          .jpeg({
            quality: 50,
          })
          .toFile(thumbnailPath)
      )
    )
  );

  constructor(
    rootAbsPath: string,
    relPath: string,
    size: number,
    modified: DateTime,
    readonly metadata: {
      channels?: number;
      chromaSubsampling: string;
      colourSpace?: string;
      dpi?: number;
      format: string;
      hasAlphaChannel?: boolean;
      hasIccProfile?: boolean;
      height: number;
      isProgressive?: boolean;
      orientation?: number;
      width: number;
    }
  ) {
    super(rootAbsPath, relPath, size, modified);
  }
}

export abstract class Media extends File {
  protected constructor(
    rootAbsPath: string,
    relPath: string,
    size: number,
    modified: DateTime,
    protected readonly format: ffprobeFormat
  ) {
    super(rootAbsPath, relPath, size, modified);
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
  thumbnail = new LazyP(() =>
    computedFile(join(this.dataDir(), "waveform.png"), (waveformAbsPath) =>
      // https://trac.ffmpeg.org/wiki/Waveform and https://stackoverflow.com/questions/32254818/generating-a-waveform-using-ffmpeg.
      queue.add(() =>
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
          `aformat=channel_layouts=mono,showwavespic=s=${PREVIEW_SCALED_WIDTH}x${Math.round(
            PREVIEW_SCALED_WIDTH * 0.4
          )}:colors=#969696`,
          "-frames:v",
          "1",
          waveformAbsPath
        ).status()
      )
    )
  );

  constructor(
    rootAbsPath: string,
    relPath: string,
    size: number,
    modified: DateTime,
    format: ffprobeFormat,
    private readonly audioStream: ffprobeAudioStream
  ) {
    super(rootAbsPath, relPath, size, modified, format);
  }

  channels() {
    return this.audioStream.channels;
  }
}

export class Video extends Media {
  readonly montage = [
    // Use frames from every 1m13s, except earlier or later than first/last 2s. These are arbitrary values.
    ...map(numberGenerator(2, this.duration() - 1, 73), (time) => ({
      file: new LazyP(() =>
        computedFile(
          join(this.dataDir(), `montage.${time}.jpg`),
          async (output) => {
            await ff.extractFrame({
              input: this.absPath(),
              output,
              timestamp: time,
              scaleWidth: PREVIEW_SCALED_WIDTH,
            });
          }
        )
      ),
      time,
    })),
  ];

  readonly content = new LazyP(async () => {
    // Prioritise any existing converted file, whether created by us or externally.
    // Assume it works and is better shaped for network streaming and browser viewing.
    const convertedWholeFilePath = join(this.dataDir(), "converted");
    const externalFileMeta = await getFileMetadata(convertedWholeFilePath);
    if (externalFileMeta) {
      return {
        absPath: convertedWholeFilePath,
        size: externalFileMeta.size,
      };
    }

    const container = this.format.format_name;
    const videoCodec = this.videoStream.codec_name;
    const audioCodec = this.audioStream?.codec_name;
    const containerConfig =
      BROWSER_SUPPORTED_MEDIA_CONTAINER_FORMATS.get(container);
    // True if specific audio and video codec combination in container supported by browser.
    const containerAndAVSupported =
      !!containerConfig?.videoCodecs.has(videoCodec) &&
      (audioCodec == undefined ||
        !!containerConfig?.audioCodecs.has(audioCodec));
    if (containerAndAVSupported) {
      return { absPath: this.absPath(), size: this.size };
    }

    // If we can find another container that the browser will support with this audio and video codec combination, we can quickly transmux instead of having to do complex, intensive, and lossy transcoding and segmenting with Media Source Extensions.
    const convertedContainer = findSuitableContainer(videoCodec, audioCodec);
    // If no suitable container found for existing video and audio codec, we can only transcode.
    if (convertedContainer != undefined) {
      return await computedFile(
        convertedWholeFilePath,
        (incompleteAbsPath) =>
          ff.convert({
            threads: 1,
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
          }),
        "Failed to convert video to different container"
      );
    }

    // If a video is relatively short, just convert entire video directly.
    if (this.duration() <= 160) {
      return await computedFile(
        convertedWholeFilePath,
        (incompleteAbsPath) =>
          ff.convert({
            threads: 1,
            input: {
              file: this.absPath(),
            },
            metadata: false,
            // We need to convert both audio and video even if one is supported,
            // as container is different and may not support the existing A/V codec.
            audio: { codec: "aac" },
            video: {
              codec: "libx264",
              crf: 18,
              vsync: "vfr",
              preset: "veryfast",
            },
            output: {
              file: incompleteAbsPath,
              format: "mp4",
            },
          }),
        "Failed to convert video"
      );
    }

    // If we can convert an entire stream as a whole, we can quickly transmux and avoid complex segmenting.
    const mseAudioContainer = mapDefined(audioCodec, (c) =>
      MSE_SUPPORTED_AUDIO_CODECS.get(c)
    );
    const mseVideoContainer = mapDefined(videoCodec, (c) =>
      MSE_SUPPORTED_VIDEO_CODECS.get(c)
    );

    // Don't probe and use keyframes:
    // - Not consistent in duration between.
    // - Some broken and old formats don't have any or have extremely long durations between.
    // - Probing is slow and causes head-of-line blocking (i.e. probing entire file delays streaming even first few segments).
    const SEGMENT_DUR = 10;
    const segments: number[] = [];
    for (
      let ts = 0;
      ts <= Math.max(0, this.duration() - SEGMENT_DUR);
      ts += SEGMENT_DUR
    ) {
      segments.push(ts);
    }
    return {
      segments,
      audio: mapDefined(audioCodec, () =>
        mseAudioContainer
          ? {
              file: new LazyP(() =>
                computedFile(
                  join(this.dataDir(), `converted.audio`),
                  (output) =>
                    ff.convert({
                      threads: 1,
                      input: {
                        file: this.absPath(),
                      },
                      metadata: false,
                      video: false,
                      audio: true,
                      output: {
                        file: output,
                        format: mseAudioContainer.container,
                        // See video segment code for more info.
                        movflags: [
                          "default_base_moof",
                          "empty_moov",
                          "faststart",
                        ],
                      },
                    })
                )
              ),
            }
          : {
              segments: segments.map((ts, i, a) => {
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
                          threads: 1,
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
                      await readFile(fdkFile.absPath, "ascii"),
                      sampleRate
                    );
                    const finalFile = await computedFile(
                      join(this.dataDir(), `converted.audio.segment.${i}`),
                      (out) =>
                        ff.convert({
                          threads: 1,
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
            }
      ),
      video: mseVideoContainer
        ? {
            file: new LazyP(() =>
              computedFile(join(this.dataDir(), `converted.video`), (output) =>
                ff.convert({
                  threads: 1,
                  input: {
                    file: this.absPath(),
                  },
                  metadata: false,
                  video: true,
                  audio: false,
                  output: {
                    file: output,
                    format: mseVideoContainer.container,
                    // See video segment code for more info.
                    movflags: ["default_base_moof", "empty_moov", "faststart"],
                  },
                })
              )
            ),
          }
        : {
            segments: segments.map((ts, i, a) => {
              const nextTs: number | undefined = a[i + 1];
              return {
                start: ts,
                file: new LazyP(async () => {
                  return await computedFile(
                    join(this.dataDir(), `converted.video.segment.${i}`),
                    async (segmentAbsPath) => {
                      await ff.convert({
                        threads: 1,
                        input: {
                          file: this.absPath(),
                          start: ts,
                          end: nextTs,
                        },
                        video: {
                          vsync: "vfr",
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

  readonly thumbnail = new LazyP(() =>
    computedFile(join(this.dataDir(), "thumbnail.jpg"), (thumbnailPath) =>
      ff.extractFrame({
        input: this.absPath(),
        output: thumbnailPath,
        timestamp: this.duration() * 0.5,
        scaleWidth: PREVIEW_SCALED_WIDTH,
      })
    )
  );

  readonly preview = new LazyP(() =>
    computedFile(join(this.dataDir(), "preview.mp4"), async (previewPath) => {
      const VIDEO_PARAMS = {
        codec: "libx264",
        crf: 23,
        fps: Math.min(24, this.fps()),
        preset: "veryfast",
        resize: { width: PREVIEW_SCALED_WIDTH },
      } as const;
      const PART_SEC = 3;
      const PARTS = 8;
      if (this.duration() < PART_SEC * (PARTS + 2)) {
        await ff.convert({
          threads: 1,
          input: {
            file: this.absPath(),
          },
          metadata: false,
          video: VIDEO_PARAMS,
          audio: false,
          output: {
            file: previewPath,
            format: "mp4",
            movflags: ["faststart"],
          },
        });
        return;
      }
      const chapterLen = this.duration() / PARTS;
      const partFiles = [];
      const partFilesListFile = join(this.dataDir(), `preview.parts.txt`);
      const promises: Promise<any>[] = [];
      // Using the ffmpeg select filter is excruciatingly slow for a tiny < 1 minute output.
      // Manually seek and extract in parallel, and stitch at end.
      for (let i = 0; i < PARTS; i++) {
        const partFile = join(this.dataDir(), `preview.part.${i}`);
        partFiles.push(`file '${partFile.replaceAll("'", "'\\''")}'${EOL}`);
        const start = chapterLen * i + chapterLen / 2 - PART_SEC / 2;
        promises.push(
          computedFile(partFile, (output) =>
            ff.convert({
              threads: 1,
              input: {
                file: this.absPath(),
                start,
                duration: PART_SEC,
              },
              metadata: false,
              video: VIDEO_PARAMS,
              audio: false,
              output: {
                file: output,
                format: "mp4",
                movflags: ["faststart"],
              },
            })
          )
        );
      }
      promises.push(writeFile(partFilesListFile, partFiles.join("")));
      await Promise.all(promises);
      await ff.concat({
        filesListFile: partFilesListFile,
        output: previewPath,
      });
    })
  );

  constructor(
    rootAbsPath: string,
    relPath: string,
    size: number,
    modified: DateTime,
    format: ffprobeFormat,
    private readonly videoStream: ffprobeVideoStream,
    private readonly audioStream?: ffprobeAudioStream
  ) {
    super(rootAbsPath, relPath, size, modified, format);
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
      const entries = await cur.entries.compute();
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
    const entries = await dir?.entries.compute();
    const entry = entries?.[last(pathComponents)];
    return entry instanceof File ? entry : undefined;
  }
}
