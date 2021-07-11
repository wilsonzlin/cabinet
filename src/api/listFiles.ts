import derivedComparator from "@xtjs/lib/js/derivedComparator";
import naturalOrdering from "@xtjs/lib/js/naturalOrdering";
import UnreachableError from "@xtjs/lib/js/UnreachableError";
import { sep } from "path";
import { Audio, Directory, File, Photo, Video } from "../library/model";
import { ClientError, Json } from "../server/response";
import { ApiCtx } from "./_common";

export type ListedFolder = {
  type: "dir";
  name: string;
  itemCount: number;
};

type BaseListedFile = {
  path: string;
  name: string;
  size: number;
};

export type ListedAudio = BaseListedFile & {
  type: "audio";
  duration: number;
  title: string;
  author?: string;
  album?: string;
  genre?: string;
  track?: number;
};

export type ListedPhoto = BaseListedFile & {
  type: "photo";
  width: number;
  height: number;
};

export type ListedVideo = BaseListedFile & {
  type: "video";
  width: number;
  height: number;
  duration: number;
  title: string;
  author?: string;
  album?: string;
  genre?: string;
  track?: number;
};

export type ListedMedia = ListedAudio | ListedVideo;

type ResultsDirEntry = ListedFolder | ListedAudio | ListedPhoto | ListedVideo;

type ResultsDir = { dir: string[]; entries: Array<ResultsDirEntry> };

export const listFilesApi = async (
  ctx: ApiCtx,
  {
    path,
    filter,
    subdirectories,
  }: {
    path: string[];
    // Possible query parameters.
    filter?: string;
    subdirectories: boolean;
  }
): Promise<
  Json<{
    results: ResultsDir[];
    totalFiles: number;
    totalDuration: number;
    totalSize: number;
  }>
> => {
  const dir = await ctx.library.getDirectory(path);
  if (!dir) {
    throw new ClientError(404, "Directory not found");
  }
  const filterRegex =
    filter &&
    RegExp(
      filter
        .trim()
        .replace(/[-[\]{}()*+?.,\\^$|#]/g, "\\$&")
        .replace(/\s+/g, "\\s+"),
      "i"
    );
  let totalDuration = 0;
  let totalFiles = 0;
  let totalSize = 0;
  const results: ResultsDir[] = [];
  const visitDir = async (dir: Directory) => {
    const entries: ResultsDirEntry[] = [];
    for (const e of Object.values(await dir.entries.compute())) {
      if (e instanceof Directory) {
        if (subdirectories) {
          await visitDir(e);
        } else if (!filterRegex || filterRegex.test(e.fileName())) {
          entries.push({
            type: "dir",
            name: e.fileName(),
            itemCount: Object.keys(e.entries).length,
          });
        }
      } else if (e instanceof File) {
        if (filterRegex && !filterRegex.test(e.fileName())) {
          continue;
        }
        totalFiles++;
        totalSize += e.size;
        if (e instanceof Audio) {
          totalDuration += e.duration();
          entries.push({
            type: "audio",
            path: e.relPath,
            name: e.fileName(),
            size: e.size,
            duration: e.duration(),
            author: e.metadata().artist,
            title: e.metadata().title ?? e.fileName(),
            album: e.metadata().album,
            genre: e.metadata().genre,
            track: e.metadata().track,
          });
        } else if (e instanceof Photo) {
          entries.push({
            type: "photo",
            path: e.relPath,
            name: e.fileName(),
            size: e.size,
            width: e.width(),
            height: e.height(),
          });
        } else if (e instanceof Video) {
          totalDuration += e.duration();
          entries.push({
            type: "video",
            path: e.relPath,
            name: e.fileName(),
            size: e.size,
            width: e.width(),
            height: e.height(),
            duration: e.duration(),
            author: e.metadata().artist,
            title: e.metadata().title ?? e.fileName(),
            album: e.metadata().album,
            genre: e.metadata().genre,
            track: e.metadata().track,
          });
        } else {
          throw new UnreachableError(e as any);
        }
      } else {
        throw new UnreachableError(e as any);
      }
    }
    results.push({
      dir: dir.relPath.split(sep),
      entries: entries.sort(
        derivedComparator(
          (e) => e.name.replace(/[^A-Za-z0-9]/g, "").toLowerCase(),
          naturalOrdering
        )
      ),
    });
  };
  await visitDir(dir);
  return new Json({
    results,
    totalDuration,
    totalFiles,
    totalSize,
  });
};
