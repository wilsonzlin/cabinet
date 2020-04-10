import {Dirent, promises as fs} from 'fs';
import {imageSize} from 'image-size';
import mime from 'mime';
import {Ora} from 'ora';
import {basename, join, relative} from 'path';
import readdirp from 'readdirp';
import {getExt} from '../util/fs';

const getImageSize = (absPath: string, spinner: Ora): Promise<{ height: number, width: number } | undefined> => new Promise(resolve =>
  imageSize(absPath, (e, r) => {
    if (e) {
      spinner.warn(`Failed to get dimensions of ${absPath}: ${e.message}`).start();
      resolve(undefined);
      return;
    }
    if (!r || r.height === undefined || r.width === undefined) {
      spinner.warn(`Image dimension information missing for "${absPath}"`).start();
      resolve(undefined);
      return;
    }
    resolve(r as any);
  }));

export interface Video {
  title: string;
  relativePath: string;
  absolutePath: string;
  size: number;
  type: string | null;
  preview?: {
    thumbnailPath: string;
    snippetPath: string;
    montageFrames: { time: number; path: string; }[];
    height: number;
    width: number;
  };
}

const MONTAGE_FRAME_BASENAME = /^montageshot([0-9]+)\.jpg$/;

export const listVideos = async (dir: string, videoExtensions: Set<string>, previewDir: string | undefined, spinner: Ora): Promise<Video[]> => {
  const entries = await readdirp.promise(dir, {
    depth: Infinity,
    fileFilter: e => videoExtensions.has(getExt(e.basename)),
    type: 'files',
    alwaysStat: true,
  });

  return await Promise.all(entries.map(async (e) => {
    const preview = previewDir == undefined ? undefined : await (async () => {
      const thumbnailPath = join(previewDir, e.path, 'thumb50.jpg');
      const snippetPath = join(previewDir, e.path, 'snippet.mp4');
      const montageFrames = await readdirp.promise(join(previewDir, e.path), {
        depth: 1,
        fileFilter: e => MONTAGE_FRAME_BASENAME.test(e.basename),
        type: 'files',
      });

      const dimensions = await getImageSize(thumbnailPath, spinner);

      return dimensions && {
        thumbnailPath,
        snippetPath,
        height: dimensions.height,
        width: dimensions.width,
        montageFrames: montageFrames.map(e => ({
          time: Number.parseInt(MONTAGE_FRAME_BASENAME.exec(e.basename)![1], 10),
          path: e.fullPath,
        })).sort((a, b) => a.time - b.time),
      };
    })();

    return {
      title: e.basename.slice(0, e.basename.lastIndexOf('.')),
      relativePath: e.path,
      absolutePath: e.fullPath,
      // e.stats should always exist as alwaysStat is true.
      size: e.stats!.size,
      type: mime.getType(e.basename),
      preview,
    };
  }));
};

export interface Photo {
  name: string;
  absolutePath: string;
  // Relative to LIBRARY_DIR.
  relativePath: string;
  height: number;
  width: number;
  type: string | null,
  isDirectory: false;
}

export interface PhotoDirectory {
  name: string;
  // Relative to LIBRARY_DIR.
  relativePath: string;
  subdirectories: PhotoDirectory[];
  photos: Photo[];
  entries: { [name: string]: PhotoDirectory | Photo };
  isDirectory: true;
}

const buildPhoto = async (dir: string, e: Dirent, rel: string, spinner: Ora): Promise<Photo | undefined> => {
  const fullPath = join(dir, e.name);

  const dimensions = await getImageSize(fullPath, spinner);

  return dimensions && {
    name: e.name,
    absolutePath: fullPath,
    relativePath: relative(rel, fullPath),
    type: mime.getType(e.name),
    height: dimensions.height,
    width: dimensions.width,
    isDirectory: false,
  };
};

export const listPhotos = async (dir: string, photoExtensions: Set<string>, rel: string, spinner: Ora): Promise<PhotoDirectory> => {
  const raw = await fs.readdir(dir, {withFileTypes: true});

  // Note that relative paths on entry objects are relative to $dir, and probably
  // not to the actual LIBRARY_DIR.

  const entries: { [name: string]: Photo | PhotoDirectory } = {};

  const [photos, subdirectories] = await Promise.all([
    Promise.all(raw
      .filter(e => e.isFile() && photoExtensions.has(getExt(e.name)))
      .map(e => buildPhoto(dir, e, rel, spinner)),
    ).then(photos => photos.filter(p => p) as Photo[]),
    Promise.all(raw
      .filter(e => e.isDirectory())
      .map(e => listPhotos(join(dir, e.name), photoExtensions, rel, spinner)),
    ).then(dirs => dirs.filter(d => d.subdirectories.length + d.photos.length)),
  ]);

  for (const entry of [...photos, ...subdirectories]) {
    entries[entry.name] = entry;
  }

  return {
    name: basename(dir),
    relativePath: relative(rel, dir),
    photos,
    subdirectories,
    entries,
    isDirectory: true,
  };
};
