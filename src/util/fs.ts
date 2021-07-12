import maybeFileStats from "@xtjs/lib/js/maybeFileStats";
import { rename, writeFile } from "fs/promises";
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
  size: number;
};

export const getFileMetadata = async (absPath: string) => {
  const stats = await maybeFileStats(absPath);
  if (stats?.size > 0) {
    return {
      size: stats.size,
    };
  }
  return undefined;
};

export class ComputedFileError extends Error {}

export function computedFile(
  absPath: string,
  provider: (incompleteAbsPath: string) => Promise<unknown>,
  errorMsg: string
): Promise<ComputedFile>;
export function computedFile(
  absPath: string,
  provider: (incompleteAbsPath: string) => Promise<unknown>
): Promise<ComputedFile | undefined>;
export async function computedFile(
  absPath: string,
  provider: (incompleteAbsPath: string) => Promise<unknown>,
  // If provided, an exception will be thrown on failure.
  // If not provided, a marker file will be written to prevent any future attempts creating the same file, and undefined will be returned.
  errorMsg?: string
) {
  // Ensure incomplete path keeps extension to allow programs like ffmpeg to continue to autodetect output format.
  const incompleteAbsPath = join(
    dirname(absPath),
    `.incomplete_${basename(absPath)}`
  );
  const failedAbsPath = join(dirname(absPath), `.failed_${basename(absPath)}`);
  if (await maybeFileStats(failedAbsPath)) {
    return undefined;
  }

  let meta;
  if (!(meta = await getFileMetadata(absPath))) {
    await provider(incompleteAbsPath);
    meta = await getFileMetadata(incompleteAbsPath);
    if (!meta) {
      if (errorMsg != undefined) {
        throw new ComputedFileError(errorMsg);
      }
      // If this fails, allow crash.
      await writeFile(failedAbsPath, "");
      return undefined;
    }
    await rename(incompleteAbsPath, absPath);
  }
  return {
    absPath,
    size: meta.size,
  };
}
