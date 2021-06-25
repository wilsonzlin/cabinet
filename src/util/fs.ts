import { basename } from "path";

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

export const isHiddenFile = async (path: string) =>
  process.platform === "win32"
    ? getWindowsFileAttributes(path).then(({ hidden }) => hidden)
    : Promise.resolve(basename(path)[0] === ".");
