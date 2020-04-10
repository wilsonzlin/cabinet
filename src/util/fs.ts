import {promises as fs} from 'fs';
import mkdirp = require('mkdirp');

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

export const emptyFile = async (path: string) => fs.writeFile(path, '');

export const ensureDir = (dir: string) => new Promise((resolve, reject) =>
  mkdirp(dir, err => {
    if (err) {
      reject(err);
    } else {
      resolve();
    }
  }));

export const getExt = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();

export const withoutExt = (name: string) => name.slice(0, name.lastIndexOf('.'));
