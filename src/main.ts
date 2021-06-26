#!/usr/bin/env node

import assertExists from "extlib/js/assertExists";
import mapDefined from "extlib/js/mapDefined";
import { promises as fs, realpathSync } from "fs";
import ora from "ora";
import * as os from "os";
import * as sacli from "sacli";
import { createLibrary } from "./library/build";
import { startServer } from "./server/server";
import { buildVideoPreviews } from "./tool/buildVideoPreviews";
import { convertVideos } from "./tool/convertVideos";

const rp = (p: string): string => realpathSync(p);

const DEFAULT_AUDIO_EXTENSIONS = new Set("mp3,ogg,wav".split(","));
const DEFAULT_VIDEO_EXTENSIONS = new Set("mp4,m4v,webm".split(","));
const DEFAULT_PHOTO_EXTENSIONS = new Set(
  "png,gif,jpg,jpeg,bmp,svg,tif,tiff,webp".split(",")
);

const cli = sacli.Command.new()
  .optional("library", String)
  .optional("state", String)
  .boolean("hidden")
  .optional("audio", (s) => new Set(s.split(",")))
  .optional("photo", (s) => new Set(s.split(",")))
  .optional("video", (s) => new Set(s.split(",")));

cli
  .subcommand("server")
  .optional("port", Number.parseInt)
  .optional("scratch", String)
  .optional("sslkey", String)
  .optional("sslcert", String)
  .optional("ssldh", String)
  .action(
    async ({
      library = process.cwd(),
      state,
      hidden,
      audio = DEFAULT_AUDIO_EXTENSIONS,
      photo = DEFAULT_PHOTO_EXTENSIONS,
      video = DEFAULT_VIDEO_EXTENSIONS,
      scratch,
      port = 0,
      ssldh,
      sslcert,
      sslkey,
    }) => {
      const spinner = ora("Finding videos and photos").start();
      const server = await startServer({
        library: await createLibrary({
          audioExtensions: audio,
          includeHiddenFiles: hidden,
          photoExtensions: photo,
          previewsDir: mapDefined(state, rp),
          rootDir: rp(library),
          spinner,
          videoExtensions: video,
        }),
        port,
        scratch: mapDefined(scratch, rp),
        ssl:
          !sslkey || !sslcert
            ? undefined
            : {
                certificate: await fs.readFile(sslcert),
                key: await fs.readFile(sslkey),
                dhParameters: ssldh ? await fs.readFile(ssldh) : undefined,
              },
      });
      spinner
        .succeed(`Server started on port ${(server.address() as any).port}`)
        .stop();
    }
  );

cli
  .subcommand("build-video-previews")
  .optional("concurrency", Number.parseInt)
  .action(
    async ({
      library = process.cwd(),
      state,
      hidden,
      video = DEFAULT_VIDEO_EXTENSIONS,
      concurrency = os.cpus().length,
    }) => {
      await buildVideoPreviews({
        previewsDir: rp(assertExists(state, "state dir needs to be provided")),
        libraryDir: rp(library),
        fileExtensions: video,
        includeHiddenFiles: hidden,
        concurrency,
      });
    }
  );

cli
  .subcommand("convert-videos")
  .optional("concurrency", Number.parseInt)
  .action(
    async ({
      library = process.cwd(),
      state,
      hidden,
      concurrency = os.cpus().length,
    }) => {
      await convertVideos({
        sourceDir: rp(library),
        convertedDir: rp(assertExists(state, "state dir needs to be provided")),
        includeHiddenFiles: hidden,
        concurrency,
      });
    }
  );

cli.eval(process.argv.slice(2));
