import {Dirent, promises as fs} from 'fs';
import {imageSize} from 'image-size';
import mime from 'mime';
import {Ora} from 'ora';
import {basename, join, relative} from 'path';
import readdirp from 'readdirp';
import {ffProbeVideo} from '../util/ff';
import {getExt, isHiddenFile} from '../util/fs';
import {assertExists, asyncFilterList, exists, isDefined, optionalMap} from '../util/lang';

const getImageSize = (absPath: string, spinner: Ora): Promise<{ height: number, width: number } | undefined> => new Promise(resolve =>
  imageSize(absPath, (e, r) => {
    if (!r) {
      spinner.warn(`Failed to get dimensions of ${absPath}: ${assertExists(e).message}`).start();
      resolve(undefined);
      return;
    }
    const {height, width} = r;
    if (height != undefined && Number.isSafeInteger(height) && width != undefined && Number.isSafeInteger(width)) {
      resolve({height, width});
    } else {
      spinner.warn(`Image dimension information missing for "${absPath}"`).start();
      resolve(undefined);
    }
  }));

export interface Video {
  title: string;
  relativePath: string;
  absolutePath: string;
  duration: number;
  fps: number;
  height: number;
  width: number;
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

const getVideoPreview = async (previewDir: string, relPath: string, spinner: Ora) => {
  const thumbnailPath = join(previewDir, relPath, 'thumb50.jpg');
  const snippetPath = join(previewDir, relPath, 'snippet.mp4');
  const montageFrames = await readdirp.promise(join(previewDir, relPath), {
    depth: 1,
    fileFilter: e => MONTAGE_FRAME_BASENAME.test(e.basename),
    type: 'files',
  });

  return optionalMap(await getImageSize(thumbnailPath, spinner), dimensions => ({
    thumbnailPath,
    snippetPath,
    height: dimensions.height,
    width: dimensions.width,
    montageFrames: montageFrames.map(e => ({
      time: Number.parseInt(MONTAGE_FRAME_BASENAME.exec(e.basename)![1], 10),
      path: e.fullPath,
    })).sort((a, b) => a.time - b.time),
  }));
};

export const listVideos = async (dir: string, videoExtensions: Set<string>, includeHiddenFiles: boolean, previewDir: string | undefined, spinner: Ora): Promise<Video[]> => {
  const entries = await readdirp.promise(dir, {
    depth: Infinity,
    fileFilter: e => videoExtensions.has(getExt(e.basename)),
    type: 'files',
    alwaysStat: true,
  }).then(entries => asyncFilterList(entries, async (e) => includeHiddenFiles || !(await isHiddenFile(e.fullPath))));

  return (await Promise.all(entries.map(async (e) =>
    optionalMap(await ffProbeVideo(e.fullPath).catch(err => {
      spinner.fail(`Failed to retrieve video properties for ${e.path}: ${err.message}`).start();
      return undefined;
    }), async (properties) => ({
      title: e.basename.slice(0, e.basename.lastIndexOf('.')),
      relativePath: e.path,
      absolutePath: e.fullPath,
      duration: properties.duration,
      fps: properties.fps,
      height: properties.height,
      width: properties.width,
      // e.stats should always exist as alwaysStat is true.
      size: e.stats!.size,
      type: mime.getType(e.basename),
      preview: await optionalMap(previewDir, d => getVideoPreview(d, e.path, spinner)),
    }))))).filter(isDefined);
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

export const listPhotos = async (dir: string, photoExtensions: Set<string>, rel: string, includeHiddenFiles: boolean, spinner: Ora): Promise<PhotoDirectory> => {
  const raw = await fs.readdir(dir, {withFileTypes: true});

  // Note that relative paths on entry objects are relative to $dir, and probably
  // not to the actual LIBRARY_DIR.

  const entries: { [name: string]: Photo | PhotoDirectory } = {};

  const [photos, subdirectories] = await Promise.all([
    asyncFilterList(raw, async (e) =>
      e.isFile()
      && photoExtensions.has(getExt(e.name))
      && (includeHiddenFiles || !(await isHiddenFile(join(dir, e.name)))))
      .then(entries => Promise.all(entries.map(e => buildPhoto(dir, e, rel, spinner))))
      .then(photos => photos.filter(exists)),
    asyncFilterList(raw, async (e) => e.isDirectory() && (includeHiddenFiles || !(await isHiddenFile(join(dir, e.name)))))
      .then(entries => Promise.all(entries.map(e => listPhotos(join(dir, e.name), photoExtensions, rel, includeHiddenFiles, spinner))))
      .then(dirs => dirs.filter(d => d.subdirectories.length + d.photos.length > 0)),
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
