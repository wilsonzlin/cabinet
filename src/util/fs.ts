import maybeFileStats from "extlib/js/maybeFileStats";
import fileType from "file-type";
import { rename } from "fs/promises";
import Mime from "mime";
import { basename, dirname, join } from "path";

const winattr = require("winattr");

type WindowsFileAttributes = {
  archive: boolean;
  hidden: boolean;
  system: boolean;
  readonly: boolean;
};

const getWindowsFileAttributes = (
  file: string
): Promise<WindowsFileAttributes> =>
  new Promise((resolve, reject) => {
    winattr.get(file, (err: Error, attrs: WindowsFileAttributes) => {
      if (err) {
        reject(err);
      } else {
        resolve(attrs);
      }
    });
  });

export const isHiddenFile = (path: string) =>
  process.platform === "win32"
    ? getWindowsFileAttributes(path).then(({ hidden }) => hidden)
    : basename(path)[0] === ".";

export const fileMime = async (absPath: string) => {
  // "file-type" uses magic bytes, but doesn't detect every file type,
  // so fall back to simple extension lookup via "mime".
  return (await fileType.fromFile(absPath))?.mime ?? Mime.getType(absPath);
};

export class LazyP<T> {
  private called = false;
  private value: any;

  constructor(private readonly provider: () => Promise<T>) {}

  compute(): Promise<T> {
    if (this.called) {
      return this.value;
    }
    this.called = true;
    return (this.value = this.provider());
  }
}

export type ComputedFile = {
  absPath: string;
  mime: string;
  size: number;
};

export const getFileMetadata = async (absPath: string) => {
  const stats = await maybeFileStats(absPath);
  if (stats) {
    const mime = await fileMime(absPath);
    if (mime != undefined) {
      return { stats, mime };
    }
  }
  return undefined;
};

export const computedFile = async (
  absPath: string,
  provider: (incompleteAbsPath: string) => Promise<unknown>,
  errorMsg: string
): Promise<ComputedFile> => {
  let meta;
  if (!(meta = await getFileMetadata(absPath))) {
    // Ensure incomplete path keeps extension to allow programs like ffmpeg to continue to autodetect output format.
    const incompleteAbsPath = join(
      dirname(absPath),
      `.incomplete_${basename(absPath)}`
    );
    await provider(incompleteAbsPath);
    meta = await getFileMetadata(incompleteAbsPath);
    if (!meta) {
      throw new Error(errorMsg);
    }
    await rename(incompleteAbsPath, absPath);
  }
  return {
    absPath,
    mime: meta.mime,
    size: meta.stats.size,
  };
};
