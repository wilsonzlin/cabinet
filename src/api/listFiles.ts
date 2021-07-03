import derivedComparator from "extlib/js/derivedComparator";
import naturalOrdering from "extlib/js/naturalOrdering";
import UnreachableError from "extlib/js/UnreachableError";
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
  const dir = await ctx.library.getDirectory(path);
  if (!dir) {
    throw new ClientError(404, "Directory not found");
  }
  // TODO Filter, subdirectories.
  const entries = Object.values(await dir.entries.compute());
  const files = entries.filter((f): f is File => f instanceof File);
  const size = files.reduce((t, f) => t + f.size, 0);
  const duration = files.reduce(
    (t, f) => t + (f instanceof Video ? f.duration() : 0),
    0
  );
  return new Json({
    approximateSize: size,
    approximateDuration: duration,
    approximateCount: entries.length,
    results: entries
      .sort(derivedComparator((e) => e.fileName(), naturalOrdering))
      .map((e) => {
        if (e instanceof Directory) {
          return {
            type: "dir",
            name: e.fileName(),
            itemCount: Object.keys(e.entries).length,
          };
        }

        if (e instanceof Audio) {
          return {
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
          };
        }

        if (e instanceof Photo) {
          return {
            type: "photo",
            path: e.relPath,
            name: e.fileName(),
            size: e.size,
            width: e.width(),
            height: e.height(),
          };
        }

        if (e instanceof Video) {
          return {
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
          };
        }

        throw new UnreachableError(e as any);
      }),
  });
};
