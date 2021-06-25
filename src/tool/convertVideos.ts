import mapDefined from "extlib/js/mapDefined";
import AsyncArray from "extlib/js/AsyncArray";
import isFile from "extlib/js/isFile";
import pathExtension from "extlib/js/pathExtension";
import pathWithoutExtension from "extlib/js/pathWithoutExtension";
import { promises as fs } from "fs";
import { mkdir } from "fs/promises";
import ora from "ora";
import { dirname, join } from "path";
import ProgressBar from "progress";
import readdirp from "readdirp";
import { ff } from "../util/ff";
import { isHiddenFile } from "../util/fs";
import PromiseQueue = require("promise-queue");

// TODO Configurable.
const CONVERTABLE_VIDEO_EXTENSIONS = new Set<string>([
  "wmv",
  "mkv",
  "avi",
  "rm",
  "rmvb",
  "flv",
  "3gp",
]);

// TODO Configurable.
const SUPPORTED_VIDEO_CODECS = new Set(["h264"]);

// TODO Configurable.
const SUPPORTED_AUDIO_CODECS = new Set(["aac"]);

const convertVideo = async (file: readdirp.EntryInfo, convertedDir: string) => {
  const absPath = file.fullPath;
  const relPath = file.path;
  // Get absolute path to converted output file with extension replaced with 'mp4'.
  const destPath = join(convertedDir, `${pathWithoutExtension(relPath)}.mp4`);

  // First convert to a temporary file so that if conversion does not finish successfully (e.g. script or system crashes),
  // when this script is run again, it will detect incompletion and restart the process.
  const destPathIncomplete = `${destPath}.incomplete`;

  await mkdir(dirname(destPath), { recursive: true });

  if (await isFile(destPath)) {
    return;
  }

  const properties = await ff.probe(absPath);

  await ff.convert({
    input: {
      file: absPath,
    },
    metadata: false,
    video: SUPPORTED_VIDEO_CODECS.has(properties.video?.codec ?? "") || {
      codec: "libx264",
      preset: "veryfast",
      crf: 17,
      faststart: true,
    },
    audio: SUPPORTED_AUDIO_CODECS.has(properties.audio?.codec ?? "") || {
      codec: "aac",
    },
    output: {
      format: "mp4",
      file: destPathIncomplete,
    },
  });

  await fs.rename(destPathIncomplete, destPath);
};

export const convertVideos = async ({
  sourceDir,
  convertedDir,
  includeHiddenFiles,
  concurrency,
}: {
  sourceDir: string;
  convertedDir: string;
  includeHiddenFiles: boolean;
  concurrency: number;
}): Promise<void> => {
  const queue = new PromiseQueue(concurrency, Infinity);

  const spinner = ora("Finding files to convert").start();

  const files = await AsyncArray.from(
    await readdirp.promise(sourceDir, {
      depth: Infinity,
      fileFilter: (entry) =>
        mapDefined(pathExtension(entry.basename), (ext) =>
          CONVERTABLE_VIDEO_EXTENSIONS.has(ext)
        ) ?? false,
    })
  )
    .filter(
      async (e) => includeHiddenFiles || !(await isHiddenFile(e.fullPath))
    )
    .toArray();

  spinner.stop();

  const activeFiles = new Array<string>();
  const progress = new ProgressBar("[:bar] :status", {
    total: files.length,
    complete: "=",
    width: 15,
  });
  const updateProgress = (file: string, type: "started" | "completed") => {
    switch (type) {
      case "started":
        activeFiles.push(file);
        break;
      case "completed":
        progress.tick();
        activeFiles.splice(activeFiles.indexOf(file), 1);
        break;
    }
    const { 0: first, length: n } = activeFiles;
    progress.render({
      status: `Converting ${first}${
        n == 1 ? "" : ` and ${n - 1} other file${n == 2 ? "" : "s"}`
      }`,
    });
  };

  await Promise.all(
    files.map((file) =>
      queue.add(async () => {
        updateProgress(file.path, "started");
        try {
          await convertVideo(file, convertedDir);
        } catch (err) {
          progress.interrupt(`Failed to convert ${file.path}: ${err.message}`);
        }
        updateProgress(file.path, "completed");
      })
    )
  );

  progress.terminate();
};
