import {cmd, job} from './exec';

const ifDefined = <T> (val: T | undefined, fn: (val: T) => void) => {
  if (val !== undefined) {
    fn(val);
  }
};

export const ffprobe = async (...args: (string | number)[]): Promise<string> =>
  (await cmd(`ffprobe`, `-v`, `error`, `-of`, `default=noprint_wrappers=1:nokey=1`, ...args)).trim();

export const getStreamCodec = (file: string, stream: 'v:0' | 'a:0'): Promise<string> =>
  ffprobe(
    `-select_streams`, stream,
    `-show_entries`, `stream=codec_name`,
    file,
  );

export const getDuration = async (file: string): Promise<number> =>
  Number.parseFloat(await ffprobe(
    `-show_entries`, `format=duration`,
    `-ignore_chapters`, 1,
    file,
  ));

export const ffmpeg = async (...args: (string | number)[]): Promise<void> =>
  job(`ffmpeg`, false, `-loglevel`, 0, `-hide_banner`, `-y`, ...args);

export const screenshot = async (src: string, pos: number, dest: string): Promise<void> =>
  ffmpeg(
    `-ss`, pos.toFixed(3),
    `-i`, src,
    `-vframes`, 1,
    `-q:v`, 2,
    dest,
  );

export const video = async ({
  input,
  metadata,
  video,
  audio,
  output,
}: {
  input: {
    file: string;
    start?: number;
    duration?: number;
  };
  metadata: boolean;
  video: boolean | {
    codec: 'libx264';
    preset: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';
    crf: number;
    faststart: boolean;
    resize?: { width: number };
  };
  audio: boolean | {
    codec: 'aac',
  };
  output: {
    format?: 'mp4';
    file: string;
    start?: number;
    duration?: number;
  };
}): Promise<void> => {
  const args = new Array<string | number>();

  // Input.
  ifDefined(input.start, ss => args.push(`-ss`, ss.toFixed(3)));
  ifDefined(input.duration, t => args.push(`-t`, t.toFixed(3)));
  args.push(`-i`, input.file);

  // Metadata.
  !metadata && args.push(`-map_metadata`, -1);

  // Video.
  if (typeof video == 'boolean') {
    video ? args.push(`-c:v`, `copy`) : args.push(`-vn`);
  } else {
    ifDefined(video.resize, ({width}) => args.push(`-filter:v`, `scale=${width}:trunc(ow/a/2)*2`));
    args.push(`-c:v`, video.codec);
    args.push(`-preset`, video.preset);
    args.push(`-crf`, video.crf);
    video.faststart && args.push(`-movflags`, `faststart`);
    args.push(`-max_muxing_queue_size`, 1048576);
  }

  // Audio.
  if (typeof audio == 'boolean') {
    audio ? args.push(`-c:a`, `copy`) : args.push(`-an`);
  } else {
    args.push(`-c:a`, audio.codec);
  }

  // Output.
  ifDefined(output.format, format => args.push(`-f`, format));
  ifDefined(output.start, ss => args.push(`-ss`, ss.toFixed(3)));
  ifDefined(output.duration, t => args.push(`-t`, t.toFixed(3)));
  args.push(output.file);

  await ffmpeg(...args);
};
