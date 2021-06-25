import propertyComparator from "extlib/js/propertyComparator";
import UnreachableError from "extlib/js/UnreachableError";
import { DirEntryType, isNotDir } from "../library/model";
import { ClientError, Json } from "../server/response";
import { ApiCtx } from "./_common";

export type ListedFolder = {
  type: "dir";
  name: string;
  itemCount: number;
};

export type ListedAudio = {
  type: "audio";
  path: string;
  name: string;
  size: number;
  format: string;
  duration: number;
  title: string;
  author?: string;
  album?: string;
  genre?: string;
  track?: number;
};

export type ListedPhoto = {
  type: "photo";
  path: string;
  name: string;
  size: number;
  format: string;
  width: number;
  height: number;
};

export type ListedVideo = {
  type: "video";
  path: string;
  name: string;
  size: number;
  format: string;
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

export const listFilesApi = async (
  ctx: ApiCtx,
  {
    path,
  }: {
    path: string[];
    // Possible query parameters.
    filter?: string;
    subdirectories: boolean;
  }
): Promise<
  Json<{
    approximateSize: number;
    approximateDuration: number;
    approximateCount: number;
    results: Array<ListedFolder | ListedAudio | ListedPhoto | ListedVideo>;
  }>
> => {
  const dir = ctx.library.getDirectory(path);
  if (!dir) {
    throw new ClientError(404, "Directory not found");
  }
  // TODO Filter, subdirectories.
  const entries = Object.values(dir.entries);
  const files = entries.filter(isNotDir);
  const size = files.reduce((t, f) => t + f.size, 0);
  const duration = files.reduce(
    (t, f) => t + (f.type == DirEntryType.VIDEO ? f.duration : 0),
    0
  );
  return new Json({
    approximateSize: size,
    approximateDuration: duration,
    approximateCount: entries.length,
    results: entries.sort(propertyComparator("name")).map((e) => {
      switch (e.type) {
        case DirEntryType.DIRECTORY:
          return {
            type: "dir",
            name: e.name,
            itemCount: Object.keys(e.entries).length,
          };

        case DirEntryType.AUDIO:
          return {
            type: "audio",
            path: e.relativePath,
            name: e.name,
            size: e.size,
            format: e.mime,
            duration: e.duration,
            author: e.artist,
            title: e.title ?? e.name,
            album: e.album,
            genre: e.genre,
            track: e.track,
          };

        case DirEntryType.PHOTO:
          return {
            type: "photo",
            path: e.relativePath,
            name: e.name,
            size: e.size,
            format: e.mime,
            width: e.width,
            height: e.height,
          };

        case DirEntryType.VIDEO:
          return {
            type: "video",
            path: e.relativePath,
            name: e.name,
            size: e.size,
            format: e.mime,
            width: e.width,
            height: e.height,
            duration: e.duration,
            author: e.artist,
            title: e.title ?? e.name,
            album: e.album,
            genre: e.genre,
            track: e.track,
          };

        default:
          throw new UnreachableError(e);
      }
    }),
  });
};
