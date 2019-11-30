import {job} from './exec';

export const ff = async (...args: (string | number)[]): Promise<void> =>
  job(`ffmpeg`, false, `-loglevel`, 0, `-hide_banner`, `-y`, ...args);

export const screenshot = async (src: string, pos: number, dest: string): Promise<void> =>
  ff(
    `-ss`, pos.toFixed(3),
    `-i`, src,
    `-vframes`, 1,
    `-q:v`, 2,
    dest,
  );
