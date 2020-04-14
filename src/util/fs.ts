import {promises as fs} from 'fs';
import mkdirp from 'mkdirp';

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
