import assertExists from "@xtjs/lib/js/assertExists";
import derivedComparator from "@xtjs/lib/js/derivedComparator";
import Dict from "@xtjs/lib/js/Dict";
import naturalOrdering from "@xtjs/lib/js/naturalOrdering";
import propertyComparator from "@xtjs/lib/js/propertyComparator";
import { sep } from "path";
import {
  Audio,
  Directory,
  DirEntry,
  File,
  Photo,
  Video,
} from "../library/model";
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
  modifiedMs: number;
};

export type ListedAudio = BaseListedFile & {
  type: "audio";
  duration: number;
  title?: string;
  author?: string;
  album?: string;
  genre?: string;
  track?: number;
};

export type ListedPhoto = BaseListedFile & {
  type: "photo";
  width: number;
  height: number;
  channels?: number;
  chromaSubsampling: string;
  colourSpace?: string;
  dpi?: number;
  format: string;
  orientation?: number;
  hasIccProfile?: boolean;
  isProgressive?: boolean;
  hasAlphaChannel?: boolean;
};

export type ListedVideo = BaseListedFile & {
  type: "video";
  width: number;
  height: number;
  duration: number;
  title?: string;
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
    types,
    subdirectories,
  }: {
    path: string[];
    // Possible query parameters.
    filter?: string;
    types: ("audio" | "photo" | "video")[];
    // Only valid when filter is also provided.
    subdirectories: boolean;
  }
): Promise<
  Json<{
    results: ResultsDir[];
  }>
> => {
  const dir = await ctx.library.getDirectory(path);
  if (!dir) {
    throw new ClientError(404, "Directory not found");
  }

  const resultsByDir = new Dict<string, ResultsDirEntry[]>();
  const visitDirEntry = async (e: DirEntry) => {
    const entries = resultsByDir.computeIfAbsent(e.dirRelPath(), () => []);
    if (e instanceof Directory && !subdirectories) {
      entries.push({
        type: "dir",
        name: e.fileName(),
        itemCount: Object.keys(e.entries).length,
      });
    } else if (e instanceof File) {
      if (e instanceof Audio && types.includes("audio")) {
        entries.push({
          type: "audio",
          path: e.relPath,
          name: e.fileName(),
          size: e.size,
          modifiedMs: e.modified.toMillis(),
          duration: e.duration(),
          author: e.metadata().artist,
          title: e.metadata().title,
          album: e.metadata().album,
          genre: e.metadata().genre,
          track: e.metadata().track,
        });
      } else if (e instanceof Photo && types.includes("photo")) {
        entries.push({
          type: "photo",
          path: e.relPath,
          name: e.fileName(),
          size: e.size,
          modifiedMs: e.modified.toMillis(),
          width: e.metadata.width,
          height: e.metadata.height,
          dpi: e.metadata.dpi,
          channels: e.metadata.channels,
          chromaSubsampling: e.metadata.chromaSubsampling,
          colourSpace: e.metadata.colourSpace,
          format: e.metadata.format,
          orientation: e.metadata.orientation,
          isProgressive: e.metadata.isProgressive,
          hasIccProfile: e.metadata.hasIccProfile,
          hasAlphaChannel: e.metadata.hasAlphaChannel,
        });
      } else if (e instanceof Video && types.includes("video")) {
        entries.push({
          type: "video",
          path: e.relPath,
          name: e.fileName(),
          size: e.size,
          modifiedMs: e.modified.toMillis(),
          width: e.width(),
          height: e.height(),
          duration: e.duration(),
          author: e.metadata().artist,
          title: e.metadata().title,
          album: e.metadata().album,
          genre: e.metadata().genre,
          track: e.metadata().track,
        });
      }
    }
  };

  if (filter) {
    if (subdirectories) {
      const ensureDirLoaded = async (dir: Directory) => {
        for (const e of Object.values(await dir.entries.compute())) {
          if (e instanceof Directory) {
            await ensureDirLoaded(e);
          }
        }
      };
      await ensureDirLoaded(dir);
    }
    for (const relPath of await dir.search(filter, subdirectories)) {
      await visitDirEntry(
        assertExists(await ctx.library.getFile(relPath.join(sep)))
      );
    }
  } else {
    for (const e of Object.values(await dir.entries.compute())) {
      await visitDirEntry(e);
    }
  }

  return new Json({
    results: [...resultsByDir]
      .map(([dir, entries]) => ({
        dir: dir.split(sep),
        entries: entries.sort(
          derivedComparator(
            (e) => e.name.replace(/[^A-Za-z0-9]/g, "").toLowerCase(),
            naturalOrdering
          )
        ),
      }))
      .sort(propertyComparator("dir")),
  });
};
