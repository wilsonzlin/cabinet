import last from "extlib/js/last";
import splitString from "extlib/js/splitString";
import { sep } from "path";

export const enum DirEntryType {
  DIRECTORY = "DIRECTORY",
  AUDIO = "AUDIO",
  PHOTO = "PHOTO",
  VIDEO = "VIDEO",
}

export const isNotDir = (e: DirEntry): e is File =>
  e.type != DirEntryType.DIRECTORY;

type DirEntryBase = {
  type: DirEntryType;
  name: string;
  relativePath: string;
  absolutePath: string;
};

export type Directory = DirEntryBase & {
  type: DirEntryType.DIRECTORY;
  entries: { [file: string]: DirEntry };
};

type FileBase = DirEntryBase & {
  size: number;
  mime: string;
};

// Many videos also use the same standard audio metadata tags.
type MediaBase = FileBase & {
  duration: number;
  artist?: string;
  album?: string;
  genre?: string;
  title?: string;
  track?: number;
};

export type Audio = MediaBase & {
  type: DirEntryType.AUDIO;
};

export type Photo = FileBase & {
  type: DirEntryType.PHOTO;
  height: number;
  width: number;
};

export type Video = MediaBase & {
  type: DirEntryType.VIDEO;
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
};

export type File = Audio | Photo | Video;
export type DirEntry = Directory | File;

export class Library {
  constructor(private readonly root: Directory) {}

  getDirectory(path: string[]): Directory | null {
    let cur: Directory = this.root;
    for (const component of path) {
      const entry = cur.entries[component];
      if (entry?.type != DirEntryType.DIRECTORY) {
        return null;
      }
      cur = entry;
    }
    return cur;
  }

  getFile(path: string): File | null {
    const pathComponents = splitString(path, sep);
    const entry = this.getDirectory(pathComponents.slice(0, -1))?.entries[
      last(pathComponents)
    ];
    return !entry || entry.type == DirEntryType.DIRECTORY ? null : entry;
  }
}
