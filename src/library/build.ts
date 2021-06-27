import { MediaFileProperties } from "@wzlin/ff";
import assertExists from "extlib/js/assertExists";
import mapExists from "extlib/js/mapExists";
import maybeFileStats from "extlib/js/maybeFileStats";
import maybeParseInt from "extlib/js/maybeParseInt";
import pathExtension from "extlib/js/pathExtension";
import fileType from "file-type";
import { promises as fs } from "fs";
import { readdir, stat } from "fs/promises";
import { imageSize } from "image-size";
import mime from "mime";
import { Ora } from "ora";
import * as os from "os";
import { basename, join, relative } from "path";
import PromiseQueue from "promise-queue";
import { ff } from "../util/ff";
import { isHiddenFile } from "../util/fs";
import {
  Audio,
  Directory,
  DirEntry,
  DirEntryType,
  Library,
  Photo,
  Video,
} from "./model";

const getMimeType = async (
  absPath: string,
  spinner: Ora
): Promise<string | undefined> => {
  // "file-type" uses magic bytes, but doesn't detect every file type,
  // so fall back to simple extension lookup via "mime".
  const type =
    (await fileType.fromFile(absPath))?.mime ?? mime.getType(absPath);
  if (!type) {
    spinner.warn(`Failed to get MIME type of ${absPath}`);
    return undefined;
  }
  return type;
};

const getImageSize = (
  absPath: string,
  spinner: Ora
): Promise<{ height: number; width: number } | undefined> =>
  new Promise((resolve) =>
    imageSize(absPath, (e, r) => {
      if (!r) {
        spinner
          .warn(
            `Failed to get dimensions of ${absPath}: ${assertExists(e).message}`
          )
          .start();
        resolve(undefined);
        return;
      }
      const { height, width } = r;
      if (
        height != undefined &&
        Number.isSafeInteger(height) &&
        width != undefined &&
        Number.isSafeInteger(width)
      ) {
        resolve({ height, width });
      } else {
        spinner
          .warn(`Image dimension information missing for "${absPath}"`)
          .start();
        resolve(undefined);
      }
    })
  );

const getMediaProperties = async (
  absPath: string,
  spinner: Ora
): Promise<MediaFileProperties | undefined> => {
  try {
    return await ff.probe(absPath);
  } catch (err) {
    spinner
      .fail(
        `Failed to retrieve media properties for ${absPath}: ${err.message}`
      )
      .start();
    return undefined;
  }
};

const MONTAGE_FRAME_BASENAME = /^montageshot([0-9]+)\.jpg$/;

export const createLibrary = async ({
  audioExtensions,
  includeHiddenFiles,
  photoExtensions,
  previewsDir,
  rootDir,
  spinner,
  videoExtensions,
}: {
  audioExtensions: Set<string>;
  includeHiddenFiles: boolean;
  photoExtensions: Set<string>;
  previewsDir?: string;
  rootDir: string;
  spinner: Ora;
  videoExtensions: Set<string>;
}): Promise<Library> => {
  const getConvertedFormats = async (relPath: string) => {
    if (!previewsDir) {
      return [];
    }

    let stateDirEnts;
    try {
      stateDirEnts = await readdir(join(previewsDir, relPath));
    } catch (e) {
      if (e.code === "ENOENT") {
        return [];
      }
      throw e;
    }

    const formats = [];
    for (const f of stateDirEnts) {
      if (!f.startsWith("converted.") || f.endsWith(".incomplete")) {
        continue;
      }
      const absPath = join(previewsDir, relPath, f);
      const stats = await stat(absPath);
      const mime = await getMimeType(absPath, spinner);
      if (!mime) {
        continue;
      }
      formats.push({ mime, absPath, size: stats.size });
    }

    return formats;
  };

  const getVideoPreview = async (relPath: string) => {
    if (!previewsDir) {
      return;
    }

    const thumbnailPath = join(previewsDir, relPath, "thumb50.jpg");
    const snippetPath = join(previewsDir, relPath, "snippet.mp4");
    const snippetStats = await maybeFileStats(snippetPath);
    let stateDirEnts;
    try {
      stateDirEnts = await readdir(join(previewsDir, relPath));
    } catch (e) {
      if (e.code === "ENOENT") {
        return;
      }
      throw e;
    }
    const montageFrames = stateDirEnts
      .filter((f) => MONTAGE_FRAME_BASENAME.test(f))
      .map((f) => ({
        fullPath: join(previewsDir, relPath, f),
        basename: f,
      }));

    return {
      thumbnailPath: (await maybeFileStats(thumbnailPath))
        ? thumbnailPath
        : undefined,
      snippet: mapExists(snippetStats, ({ size }) => ({
        path: snippetPath,
        size,
      })),
      montageFrames: Object.fromEntries(
        montageFrames.map((e) => [
          Number.parseInt(
            assertExists(MONTAGE_FRAME_BASENAME.exec(e.basename))[1],
            10
          ),
          e.fullPath,
        ])
      ),
    };
  };

  const buildAudio = async (
    dir: string,
    file: string
  ): Promise<Audio | undefined> => {
    const absPath = join(dir, file);
    const relPath = relative(rootDir, absPath);
    const stats = await fs.stat(absPath);

    return mapExists(
      await getMediaProperties(absPath, spinner),
      async (properties) =>
        mapExists(await getMimeType(absPath, spinner), async (mimeType) => ({
          type: DirEntryType.AUDIO as const,
          name: file,
          relativePath: relPath,
          absolutePath: absPath,
          convertedFormats: await getConvertedFormats(relPath),
          size: stats.size,
          mime: mimeType,
          duration: properties.duration,
          artist: properties.metadata.artist,
          album: properties.metadata.album,
          genre: properties.metadata.genre,
          title: properties.metadata.title,
          track: maybeParseInt(properties.metadata.track ?? ""),
        }))
    );
  };

  const buildVideo = async (
    dir: string,
    file: string
  ): Promise<Video | undefined> => {
    const absPath = join(dir, file);
    const relPath = relative(rootDir, absPath);
    const stats = await fs.stat(absPath);

    return mapExists(
      await getMediaProperties(absPath, spinner),
      async (properties) =>
        mapExists(await getMimeType(absPath, spinner), async (mimeType) => ({
          type: DirEntryType.VIDEO as const,
          name: file,
          relativePath: relPath,
          absolutePath: absPath,
          convertedFormats: await getConvertedFormats(relPath),
          size: stats.size,
          mime: mimeType,
          duration: properties.duration,
          artist: properties.metadata.artist,
          album: properties.metadata.album,
          genre: properties.metadata.genre,
          title: properties.metadata.title,
          track: maybeParseInt(properties.metadata.track ?? ""),
          fps: assertExists(properties.video?.fps),
          height: assertExists(properties.video?.height),
          width: assertExists(properties.video?.width),
          preview: await getVideoPreview(relPath),
        }))
    );
  };

  const buildPhoto = async (
    dir: string,
    file: string
  ): Promise<Photo | undefined> => {
    const absPath = join(dir, file);
    const relPath = relative(rootDir, absPath);
    const stats = await fs.stat(absPath);

    return mapExists(await getImageSize(absPath, spinner), async (dimensions) =>
      mapExists(await getMimeType(absPath, spinner), async (mimeType) => ({
        type: DirEntryType.PHOTO,
        name: file,
        absolutePath: absPath,
        relativePath: relPath,
        convertedFormats: await getConvertedFormats(relPath),
        size: stats.size,
        mime: mimeType,
        height: dimensions.height,
        width: dimensions.width,
      }))
    );
  };

  // Use a queue to avoid spawning too many processes at once,
  // which could lead to freezes and out-of-open-files errors.
  const queue = new PromiseQueue(os.cpus().length, Infinity);
  const listDir = async (dir: string): Promise<Directory> => {
    const entries: { [name: string]: DirEntry } = Object.create(null);

    const dirents = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(
      dirents.map(async (dirent) => {
        const { name } = dirent;
        const absPath = join(dir, name);
        if (!includeHiddenFiles && (await isHiddenFile(absPath))) {
          return;
        }

        let entry: DirEntry | undefined = undefined;
        if (dirent.isFile()) {
          const ext = pathExtension(name);
          if (ext) {
            if (audioExtensions.has(ext)) {
              entry = await queue.add(() => buildAudio(dir, name));
            } else if (photoExtensions.has(ext)) {
              entry = await queue.add(() => buildPhoto(dir, name));
            } else if (videoExtensions.has(ext)) {
              entry = await queue.add(() => buildVideo(dir, name));
            }
          }
        } else if (dirent.isDirectory()) {
          entry = await listDir(absPath);
        }

        if (entry) {
          entries[name] = entry;
        }
      })
    );

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
