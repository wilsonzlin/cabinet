import {promises as fs} from 'fs';
import mkdirp from 'mkdirp';
import {basename} from 'path';

const winattr = require('winattr');

type WindowsFileAttributes = {
  archive: boolean;
  hidden: boolean;
  system: boolean;
  readonly: boolean;
};

export const nullStat = async (path: string) => {
  try {
    return await fs.stat(path);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
};

export const isFile = async (path: string): Promise<boolean> => !!((await nullStat(path))?.isFile());

export const ensureDir = (dir: string) => mkdirp(dir);

export const getExt = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();

export const withoutExt = (name: string) => name.slice(0, name.lastIndexOf('.'));

const getWindowsFileAttributes = (file: string): Promise<WindowsFileAttributes> => new Promise((resolve, reject) => {
  winattr.get(file, (err: Error, attrs: WindowsFileAttributes) => {
    if (err) {
      reject(err);
    } else {
      resolve(attrs);
    }
  });
});

export const isHiddenFile = async (path: string) => process.platform === 'win32'
  ? getWindowsFileAttributes(path).then(({hidden}) => hidden)
  : Promise.resolve(basename(path)[0] === '.');
