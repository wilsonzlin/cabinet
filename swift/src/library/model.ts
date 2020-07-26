import {basename, dirname} from 'path';

export const enum DirEntryType {
  DIRECTORY = 'DIRECTORY',
  PHOTO = 'PHOTO',
  VIDEO = 'VIDEO',
}

export const isNotDir = (e: DirEntry): e is File => e.type != DirEntryType.DIRECTORY;

type DirEntryBase = {
  type: DirEntryType;
  name: string;
  relativePath: string;
  absolutePath: string;
}

export type Directory = DirEntryBase & {
  type: DirEntryType.DIRECTORY;
  entries: { [file: string]: DirEntry };
}

type FileBase = DirEntryBase & {
  size: number;
  mime: string;
}

export type Video = FileBase & {
  type: DirEntryType.VIDEO;
  duration: number;
  fps: number;
  height: number;
  width: number;
  preview?: {
    thumbnailPath: string;
    snippet?: {
      path: string;
      size: number;
    };
    montageFrames: { [time: number]: string };
    height: number;
    width: number;
  };
}

export type Photo = FileBase & {
  type: DirEntryType.PHOTO;
  height: number;
  width: number;
}

export type File = Video | Photo;
export type DirEntry = Directory | File;

export class Library {
  constructor (
    private readonly root: Directory,
  ) {
  }

  getDirectory (path: string): Directory | null {
    let cur: Directory = this.root;
    // Filter empty components so that:
    // - a path with multiple contiguous directory separators works
    // - a path with leading separators works
    // - a path with trailing separators works
    // - an empty path works
    // Also filter redundant '.' components.
    for (const component of path.split('/').filter(c => c).filter(c => c != '.')) {
      const entry = cur.entries[component];
      if (entry?.type != DirEntryType.DIRECTORY) {
        return null;
      }
      cur = entry;
    }
    return cur;
  }

  getFile (path: string): File | null {
    const entry = this.getDirectory(dirname(path))?.entries[basename(path)];
    return !entry || entry.type == DirEntryType.DIRECTORY ? null : entry;
  }
}
