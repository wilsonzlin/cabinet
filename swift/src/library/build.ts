import {MediaFileProperties} from '@wzlin/ff';
import {AsyncArray} from 'extlib/js/asyncarray/AsyncArray';
import {getExt} from 'extlib/js/fs/name/name';
import {nullStat} from 'extlib/js/fs/stats/getStats';
import {assertExists} from 'extlib/js/optional/assert';
import {mapOptional} from 'extlib/js/optional/map';
import {promises as fs} from 'fs';
import {imageSize} from 'image-size';
import mime from 'mime';
import {Ora} from 'ora';
import {basename, join, relative} from 'path';
import readdirp from 'readdirp';
import {ff} from '../util/ff';
import {isHiddenFile} from '../util/fs';
import {Directory, DirEntry, DirEntryType, Library, Photo, Video} from './model';

const getMimeType = (absPath: string, spinner: Ora): string | undefined => {
  const type = mime.getType(absPath);
  if (!type) {
    spinner.warn(`Failed to get MIME type of ${absPath}`);
    return undefined;
  }
  return type;
};

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

const getVideoProperties = async (absPath: string, spinner: Ora): Promise<MediaFileProperties | undefined> => {
  try {
    return await ff.probe(absPath);
  } catch (err) {
    spinner.fail(`Failed to retrieve video properties for ${absPath}: ${err.message}`).start();
    return undefined;
  }
};

const MONTAGE_FRAME_BASENAME = /^montageshot([0-9]+)\.jpg$/;

export const createLibrary = async ({
  rootDir,
  includeHiddenFiles,
  videoExtensions,
  photoExtensions,
  previewsDir,
  spinner,
}: {
  rootDir: string;
  includeHiddenFiles: boolean;
  videoExtensions: Set<string>;
  photoExtensions: Set<string>;
  previewsDir?: string;
  spinner: Ora;
}): Promise<Library> => {
  const getVideoPreview = async (relPath: string) => {
    if (!previewsDir) {
      return;
    }

    const thumbnailPath = join(previewsDir, relPath, 'thumb50.jpg');
    const snippetPath = join(previewsDir, relPath, 'snippet.mp4');
    const snippetStats = await nullStat(snippetPath);
    const montageFrames = await readdirp.promise(join(previewsDir, relPath), {
      depth: 1,
      fileFilter: e => MONTAGE_FRAME_BASENAME.test(e.basename),
      type: 'files',
    });

    return mapOptional(await getImageSize(thumbnailPath, spinner), dimensions => ({
      thumbnailPath,
      snippet: mapOptional(snippetStats, ({size}) => ({
        path: snippetPath,
        size,
      })),
      height: dimensions.height,
      width: dimensions.width,
      montageFrames: Object.fromEntries(montageFrames.map(e => [
        Number.parseInt(assertExists(MONTAGE_FRAME_BASENAME.exec(e.basename))[1], 10),
        e.fullPath,
      ])),
    }));
  };

  const buildVideo = async (dir: string, file: string): Promise<Video | undefined> => {
    const absPath = join(dir, file);
    const relPath = relative(rootDir, absPath);
    const stats = await fs.stat(absPath);

    return mapOptional(
      await getVideoProperties(absPath, spinner),
      async (properties) => mapOptional(
        getMimeType(absPath, spinner),
        async (mimeType) => ({
          type: DirEntryType.VIDEO as const,
          name: file,
          relativePath: relPath,
          absolutePath: absPath,
          duration: properties.duration,
          fps: properties.fps,
          height: properties.height,
          width: properties.width,
          size: stats.size,
          mime: mimeType,
          preview: await getVideoPreview(relPath),
        }),
      ),
    );
  };

  const buildPhoto = async (dir: string, file: string): Promise<Photo | undefined> => {
    const absPath = join(dir, file);
    const relPath = relative(rootDir, absPath);
    const stats = await fs.stat(absPath);

    return mapOptional(await getImageSize(absPath, spinner), dimensions => mapOptional(getMimeType(absPath, spinner), mimeType => ({
      type: DirEntryType.PHOTO,
      name: file,
      absolutePath: absPath,
      relativePath: relPath,
      size: stats.size,
      mime: mimeType,
      height: dimensions.height,
      width: dimensions.width,
    })));
  };

  const listDir = async (dir: string): Promise<Directory> => {
    const entries: { [name: string]: DirEntry } = {};

    await AsyncArray.from(await fs.readdir(dir, {withFileTypes: true}))
      .forEach(async (dirent) => {
        const {name} = dirent;
        const absPath = join(dir, name);
        if (!includeHiddenFiles && await isHiddenFile(absPath)) {
          return;
        }

        let entry: DirEntry | undefined = undefined;
        if (dirent.isFile()) {
          const ext = getExt(name);
          if (photoExtensions.has(ext)) {
            entry = await buildPhoto(dir, name);
          } else if (videoExtensions.has(ext)) {
            entry = await buildVideo(dir, name);
          }
        } else if (dirent.isDirectory()) {
          entry = await listDir(absPath);
        }

        if (entry) {
          entries[name] = entry;
        }
      });

    return {
      type: DirEntryType.DIRECTORY,
      name: basename(dir),
      absolutePath: dir,
      relativePath: relative(rootDir, dir),
      entries,
    };
  };

  return new Library(await listDir(rootDir));
};
