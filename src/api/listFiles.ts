import assertExists from "@xtjs/lib/js/assertExists";
import Dict from "@xtjs/lib/js/Dict";
import naturalOrdering from "@xtjs/lib/js/naturalOrdering";
import propertyComparator from "@xtjs/lib/js/propertyComparator";
import splitString from "@xtjs/lib/js/splitString";
import tokeniseForNaturalOrdering from "@xtjs/lib/js/tokeniseForNaturalOrdering";
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
    limit = Infinity,
    excludeFolders = false,
    subdirectories,
  }: {
    path: string[];
    // Possible query parameters.
    filter?: string;
    types: ("audio" | "photo" | "video")[];
    limit?: number;
    excludeFolders?: boolean;
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

  let totalResults = 0;
  const resultsByDir = new Dict<string, ResultsDirEntry[]>();
  const visitDirEntry = async (e: DirEntry) => {
    if (totalResults > limit) {
      return;
    }
    const entries = resultsByDir.computeIfAbsent(e.dirRelPath(), () => []);
    if (e instanceof Directory && !subdirectories && !excludeFolders) {
      entries.push({
        type: "dir",
        name: e.fileName(),
        itemCount: Object.keys(await e.entries.compute()).length,
      });
      totalResults++;
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
        totalResults++;
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
        totalResults++;
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
        totalResults++;
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
        dir: splitString(dir, sep),
        entries: entries
          .map((entry) => ({
            entry,
            tokens: tokeniseForNaturalOrdering(entry.name),
          }))
          .sort(propertyComparator("tokens", naturalOrdering))
          .map(({ entry }) => entry),
      }))
      .sort(propertyComparator("dir")),
  });
};
