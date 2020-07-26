import {ifDefined} from 'extlib/js/optional/cond';
import {cmd, job} from './exec';

export type MediaFileProperties = {
  height: number;
  width: number;
  fps: number;
  duration: number;
  audioCodec: string;
  videoCodec: string;
};

export const ffProbeVideo = async (file: string): Promise<MediaFileProperties> => {
  const raw = (await cmd(
    `ffprobe`,
    `-v`, `error`,
    `-show_entries`, `stream=codec_type,codec_name,width,height,r_frame_rate:format=duration`,
    `-ignore_chapters`, 1,
    file,
  )).trim();

  const properties: MediaFileProperties = {} as any;
  for (const [_, sectionName, sectionData] of raw.matchAll(/\[([A-Z]+)]([^\[]*)\[\/\1]/g)) {
    const values: { [key: string]: string } = Object.fromEntries(
      sectionData
        .trim()
        .split(/[\r\n]+/)
        .map(kv => kv.split('=', 2)),
    );
    switch (sectionName) {
    case 'STREAM':
      properties.videoCodec = values.codec_name;
      switch (values.codec_type) {
      case 'video':
        properties.height = Number.parseInt(values.height, 10);
        properties.width = Number.parseInt(values.width, 10);
        properties.fps = values.r_frame_rate
          .split('/')
          .map(p => Number.parseInt(p, 10))
          .reduce((numerator, denominator) => numerator / denominator);
        break;
      case 'audio':
        break;
      }
      break;
    case 'FORMAT':
      properties.duration = Number.parseFloat(values.duration);
      break;
    }
  }
  return properties;
};

export const ffmpeg = async (...args: (string | number)[]): Promise<void> =>
  job(`ffmpeg`, false, `-loglevel`, `fatal`, `-hide_banner`, `-y`, ...args);

export const screenshot = async (src: string, pos: number, dest: string, scaleWidth: number): Promise<void> =>
  ffmpeg(
    `-ss`, pos.toFixed(3),
    `-i`, src,
    `-filter:v`, `scale=${scaleWidth}:-1`,
    `-frames:v`, 1,
    `-q:v`, 2,
    dest,
  );

export const ffVideo = async ({
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
  video: boolean | ({
    fps?: number,
    resize?: { width: number };
  } & ({
    codec: 'libx264';
    preset: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';
    crf: number;
    faststart: boolean;
  } | {
    codec: 'gif',
    loop: boolean | number;
  }));
  audio: boolean | {
    codec: 'aac',
  };
  output: {
    format?: string;
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
    const filters = new Array<string>();
    ifDefined(video.fps, (fps) => filters.push(`fps=${fps}`));
    ifDefined(video.resize, ({width}) => filters.push(`scale=${width}:-2`));
    if (filters.length) {
      args.push(`-filter:v`, filters.join(','));
    }

    args.push(`-c:v`, video.codec);
    switch (video.codec) {
    case 'libx264':
      args.push(`-preset`, video.preset);
      args.push(`-crf`, video.crf);
      video.faststart && args.push(`-movflags`, `faststart`);
      args.push(`-max_muxing_queue_size`, 1048576);
      break;
    case 'gif':
      if (typeof video.loop == 'boolean') {
        args.push(`-loop`, video.loop ? 0 : -1);
      } else {
        args.push(`-loop`, video.loop);
      }
      break;
    }
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
