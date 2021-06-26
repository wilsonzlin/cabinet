import maybeParseInt from "extlib/js/maybeParseInt";
import { MediaFileProperties } from "@wzlin/ff";
import assertExists from "extlib/js/assertExists";
import mapExists from "extlib/js/mapExists";
import maybeFileStats from "extlib/js/maybeFileStats";
import pathExtension from "extlib/js/pathExtension";
import { promises as fs } from "fs";
import { readdir } from "fs/promises";
import { imageSize } from "image-size";
import mime from "mime";
import { Ora } from "ora";
import { basename, join, relative } from "path";
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

const getMimeType = (absPath: string, spinner: Ora): string | undefined => {
  const type = mime.getType(absPath);
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
  const getVideoPreview = async (relPath: string) => {
    if (!previewsDir) {
      return;
    }

    const thumbnailPath = join(previewsDir, relPath, "thumb50.jpg");
    const snippetPath = join(previewsDir, relPath, "snippet.mp4");
    const snippetStats = await maybeFileStats(snippetPath);
    const montageFrames = await readdir(join(previewsDir, relPath)).then(
      (files) =>
        files
          .filter((f) => MONTAGE_FRAME_BASENAME.test(f))
          .map((f) => ({
            fullPath: join(previewsDir, relPath, f),
            basename: f,
          }))
    );

    return mapExists(
      await getImageSize(thumbnailPath, spinner),
      (dimensions) => ({
        thumbnailPath,
        snippet: mapExists(snippetStats, ({ size }) => ({
          path: snippetPath,
          size,
        })),
        height: dimensions.height,
        width: dimensions.width,
        montageFrames: Object.fromEntries(
          montageFrames.map((e) => [
            Number.parseInt(
              assertExists(MONTAGE_FRAME_BASENAME.exec(e.basename))[1],
              10
            ),
            e.fullPath,
          ])
        ),
      })
    );
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
        mapExists(getMimeType(absPath, spinner), async (mimeType) => ({
          type: DirEntryType.AUDIO as const,
          name: file,
          relativePath: relPath,
          absolutePath: absPath,
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
        mapExists(getMimeType(absPath, spinner), async (mimeType) => ({
          type: DirEntryType.VIDEO as const,
          name: file,
          relativePath: relPath,
          absolutePath: absPath,
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

    return mapExists(await getImageSize(absPath, spinner), (dimensions) =>
      mapExists(getMimeType(absPath, spinner), (mimeType) => ({
        type: DirEntryType.PHOTO,
        name: file,
        absolutePath: absPath,
        relativePath: relPath,
        size: stats.size,
        mime: mimeType,
        height: dimensions.height,
        width: dimensions.width,
      }))
    );
  };

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
          if (ext && photoExtensions.has(ext)) {
            entry = await buildPhoto(dir, name);
          } else if (ext && videoExtensions.has(ext)) {
            entry = await buildVideo(dir, name);
          } else if (ext && audioExtensions.has(ext)) {
            entry = await buildAudio(dir, name);
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
