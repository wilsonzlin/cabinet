import isFile from "extlib/js/isFile";
import pathExtension from "extlib/js/pathExtension";
import recursiveReaddir from "extlib/js/recursiveReaddir";
import { mkdir } from "fs/promises";
import ora from "ora";
import { join } from "path";
import ProgressBar from "progress";
import { ff } from "../util/ff";
import { isHiddenFile } from "../util/fs";
import PromiseQueue = require("promise-queue");

// Consider:
// - HiDPI displays and zoomed-in viewports e.g. logical 180px is physical 360px.
// - Tile lists with awkward width where 2 columns can't fit so only 1 ultra-wide column is possible.
// - Bandwidth: a list of just 20 will require 20 x THUMB_SIZE network data and requests.
const PREVIEW_SCALED_WIDTH = 500;

const generateSnippet = (
  src: string,
  out: string,
  videoTotalDuration: number
): Promise<void> => {
  const PART_LEN = 3;
  const chapterLen = videoTotalDuration / 8;
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const start = chapterLen * i + chapterLen / 2 - PART_LEN / 2;
    const end = start + PART_LEN;
    parts.push([start, end]);
  }
  return ff.convert({
    input: {
      file: src,
    },
    metadata: false,
    video: {
      codec: "libx264",
      faststart: true,
      crf: 17,
      preset: "veryslow",
      resize: { width: PREVIEW_SCALED_WIDTH },
      filter: `select='${parts
        .map(([start, end]) => `between(t,${start},${end})`)
        .join("+")}',setpts=N/FRAME_RATE/TB`,
    },
    audio: false,
    output: {
      file: out,
      format: "mp4",
    },
  });
};

type PromiseGeneratorWithStatus = [string, () => Promise<any>];

export const buildVideoPreviews = async ({
  libraryDir,
  previewsDir,
  concurrency,
  fileExtensions,
  includeHiddenFiles,
}: {
  libraryDir: string;
  previewsDir: string;
  concurrency: number;
  fileExtensions: Set<string>;
  includeHiddenFiles: boolean;
}): Promise<void> => {
  const spinner = ora("Finding videos").start();
  const promises: PromiseGeneratorWithStatus[] = [];
  for await (const relPath of await recursiveReaddir(libraryDir)) {
    if (!fileExtensions.has(pathExtension(relPath) ?? "")) {
      continue;
    }

    const absPath = join(libraryDir, relPath);
    const outDir = join(previewsDir, relPath);

    if (!includeHiddenFiles && (await isHiddenFile(absPath))) {
      return;
    }

    await mkdir(outDir, { recursive: true });

    // Get duration of video in seconds.
    let duration: number;
    try {
      duration = (await ff.probe(absPath)).duration;
    } catch (err) {
      spinner
        .fail(`Failed to retrieve duration for ${relPath}: ${err.message}`)
        .start();
      return;
    }

    // Create thumbnails at percentiles.
    const thumbDest = join(outDir, `thumb50.jpg`);
    if (!(await isFile(thumbDest))) {
      promises.push([
        `Generating thumbnail for ${relPath}`,
        () =>
          ff.extractFrame({
            input: absPath,
            output: thumbDest,
            timestamp: duration * 0.5,
            scaleWidth: PREVIEW_SCALED_WIDTH,
          }),
      ]);
    }

    // Create preview snippet.
    const snippetDest = join(outDir, "snippet.mp4");
    if (!(await isFile(snippetDest))) {
      promises.push([
        `Generating snippet for ${relPath}`,
        () => generateSnippet(absPath, snippetDest, duration),
      ]);
    }

    // Create montage.
    // We want to get a shot every 2 seconds.
    const montageShotCount = Math.floor(Math.min(200, duration / 2));

    const montageShots = await Promise.all(
      Array(montageShotCount)
        .fill(void 0)
        .map(async (_, no) => {
          const pos = Math.round((duration * no) / montageShotCount);
          // Avoid using subdirectories that might cause race conditions when creating and deleting concurrently.
          const dest = join(outDir, `montageshot${pos}.jpg`);
          return {
            time: pos,
            file: dest,
            exists: await isFile(dest),
          };
        })
    );

    for (const { time, file, exists } of montageShots) {
      if (exists) {
        continue;
      }
      promises.push([
        `Generating montage for ${relPath}`,
        () =>
          ff.extractFrame({
            input: absPath,
            timestamp: time,
            output: file,
            scaleWidth: PREVIEW_SCALED_WIDTH,
          }),
      ]);
    }

    // Update text last as otherwise text immediately goes to last file as it updates before all the asynchronous work.
    spinner.text = `Probed ${relPath}`;
  }

  spinner.stop();

  const queue = new PromiseQueue(concurrency, Infinity);

  const progress = new ProgressBar("[:bar] :status", {
    total: promises.length,
    complete: "=",
    width: 15,
  });

  await Promise.all(
    promises.map(async ([status, promiseProducer]) => {
      try {
        await queue.add(() => {
          progress.render({ status });
          return promiseProducer();
        });
      } catch (err) {
        progress.interrupt(err.message);
      }
      progress.tick();
    })
  );

  progress.terminate();
};
