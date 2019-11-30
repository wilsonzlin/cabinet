import {Dirent, promises as fs} from 'fs';
import {imageSize} from 'image-size';
import mime from 'mime';
import {basename, join, relative} from 'path';
import readdirp from 'readdirp';
import {promisify} from 'util';
import {getExt} from '../util/fs';

const getImageSize = promisify(imageSize);

export interface Video {
  title: string;
  relativePath: string;
  absolutePath: string;
  size: number;
  type: string | null,
}

export const listVideos = async (dir: string, videoExtensions: Set<string>): Promise<Video[]> => {
  const entries = await readdirp.promise(dir, {
    depth: Infinity,
    fileFilter: e => videoExtensions.has(getExt(e.basename)),
    type: 'files',
    alwaysStat: true,
  });

  return entries.map(e => ({
    title: e.basename.slice(0, e.basename.lastIndexOf('.')),
    relativePath: e.path,
    absolutePath: e.fullPath,
    // e.stats should always exist as alwaysStat is true.
    size: e.stats!.size,
    type: mime.getType(e.basename),
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

const buildPhoto = async (dir: string, e: Dirent, rel: string): Promise<Photo | undefined> => {
  const fullPath = join(dir, e.name);

  let dimensions;
  try {
    dimensions = await getImageSize(fullPath);
  } catch (err) {
    console.error(`Failed to get dimensions of ${fullPath}: ${err.message}`);
    return;
  }

  if (!dimensions || dimensions.height === undefined || dimensions.width === undefined) {
    console.error(`Failed to get dimensions of ${fullPath}`);
    return;
  }

  return {
    name: e.name,
    absolutePath: fullPath,
    relativePath: relative(rel, fullPath),
    type: mime.getType(e.name),
    height: dimensions.height,
    width: dimensions.width,
    isDirectory: false,
  };
};

export const listPhotos = async (dir: string, photoExtensions: Set<string>, rel: string): Promise<PhotoDirectory> => {
  const raw = await fs.readdir(dir, {withFileTypes: true});

  // Note that relative paths on entry objects are relative to $dir, and probably
  // not to the actual LIBRARY_DIR.

  const entries: { [name: string]: Photo | PhotoDirectory } = {};

  const [photos, subdirectories] = await Promise.all([
    Promise.all(raw
      .filter(e => e.isFile() && photoExtensions.has(getExt(e.name)))
      .map(e => buildPhoto(dir, e, rel)),
    ).then(photos => photos.filter(p => p) as Photo[]),
    Promise.all(raw
      .filter(e => e.isDirectory())
      .map(e => listPhotos(join(dir, e.name), photoExtensions, rel)),
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
