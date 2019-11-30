import readdirp from 'readdirp';
import {join} from 'path';
import {emptyFile, ensureDir, getExt, isFile, nullStat} from '../util/fs';
import {ff, screenshot} from '../util/ff';
import {cmd, job} from '../util/exec';
import PromiseQueue = require('promise-queue');

export const buildVideoPreviews = async ({
  libraryDir,
  previewsDir,
  concurrency,
  fileExtensions,
  thumbnailPercentiles = [50],
  snippetDuration = 5,
}: {
  libraryDir: string,
  previewsDir: string,
  concurrency: number,
  fileExtensions: Set<string>,
  thumbnailPercentiles?: number[],
  snippetDuration?: number,
}): Promise<void> => {
  const queue = new PromiseQueue(concurrency, Infinity);
  const promisesToWaitOn: Promise<any>[] = [];

  const queueWaitable = (promiseProducer: () => Promise<any>) => {
    const promise = queue.add(promiseProducer);
    promisesToWaitOn.push(promise);
    return promise;
  };

  const files = await readdirp.promise(libraryDir, {
    depth: Infinity,
    fileFilter: entry => fileExtensions.has(getExt(entry.basename)),
  });

  await Promise.all(files.map(async (file) => {
    const absPath = file.fullPath;
    const relPath = file.path;
    const outDir = join(previewsDir, relPath);

    await ensureDir(outDir);

    // Get duration of video in seconds.
    let duration: number;
    try {
      duration = Number.parseFloat(await cmd(
        `ffprobe`,
        `-v`,
        `error`,
        `-show_entries`,
        `format=duration`,
        `-of`,
        `default=noprint_wrappers=1:nokey=1`,
        absPath,
      ));
    } catch (err) {
      console.error(`Failed to retrieve duration for "${relPath}": ${err.message}`);
      return;
    }

    // Create thumbnails at percentiles.
    for (const percentile of thumbnailPercentiles) {
      const thumbPos = duration * percentile / 100;
      const thumbDest = join(outDir, `thumb${percentile}.jpg`);
      if (!(await isFile(thumbDest))) {
        queueWaitable(() => screenshot(absPath, thumbPos, thumbDest));
      }
    }

    // Create preview snippet.
    const snippetPos = Math.max(0, duration * 0.5 - (snippetDuration / 2));
    const snippetDest = join(outDir, 'snippet.mp4');
    if (!(await isFile(snippetDest))) {
      queueWaitable(() => ff(
        `-ss`, snippetPos,
        `-i`, absPath,
        `-filter:v`, `scale=180:trunc(ow/a/2)*2`,
        `-c:v`, `libx264`,
        `-map_metadata`, -1,
        `-preset`, `veryslow`,
        `-crf`, 17,
        `-max_muxing_queue_size`, 1048576,
        `-movflags`,
        `+faststart`,
        `-an`,
        `-t`, snippetDuration,
        `-f`, `mp4`,
        snippetDest,
      ));
    }

    // Create montage.
    const montageDest = join(outDir, 'montage.jpg');
    const nomontage = join(outDir, '.nomontage');

    if (!(await Promise.all([isFile(nomontage), isFile(montageDest)])).some(f => f)) {
      // We want to get a shot every 2 seconds except for first and last 2 seconds, up to 200 shots.
      // More granularity would probably not be much use and exceed JPEG dimension limits.
      const montageGranularity = Math.floor(Math.min(200, duration / 2));

      if (montageGranularity <= 2) {
        // Video is too short for a montage, so don't create one.
        await emptyFile(nomontage);
        console.info(`Video "${relPath}" is too short for montage`);
      } else {
        let montageFailed = false;
        const montageShots: string[] = [];
        const montageShotPromises: Promise<any>[] = [];

        // Ignore first and last shots. First and last are usually not useful, and last can possibly cause
        // boundary issues with ffmpeg.
        for (let montageShotNo = 1; montageShotNo < montageGranularity - 1; montageShotNo++) {
          const montageShotPos = duration * montageShotNo / montageGranularity;
          // Avoid using subdirectories that might cause race conditions when creating and deleting concurrently.
          const montageShotDest = join(outDir, `montageshot${montageShotNo}.jpg`);
          montageShots.push(montageShotDest);

          montageShotPromises.push(queueWaitable(async () => {
            if (montageFailed || await isFile(montageShotDest)) {
              return;
            }

            await screenshot(absPath, montageShotPos, montageShotDest);

            const stats = await nullStat(montageShotDest);
            if (!stats || !stats.size) {
              // Montage shot failed to be created. Don't create montage and don't try again in future.
              // Keep empty shot file so that which shots failed are known.
              console.error(`Failed to generate montage shot ${montageShotNo} at ${montageShotPos}s for ${relPath}`);
              montageFailed = true;
            }
          }));
        }

        // Don't put this in queue, as it depends on other queued promises.
        promisesToWaitOn.push(Promise.all(montageShotPromises).then(async () => {
          if (montageFailed) {
            await emptyFile(nomontage);
          } else {
            // Make sure to await, as by this time promisesToWaitOn has already been Promise.all'd.
            await queueWaitable(() => job(`convert`, true, ...montageShots, `+append`, `-resize`, `x120`, montageDest));
            // Don't delete montage shots. They take a long time to generate and can be reused in case previous steps
            // fail due to chance, system, misconfiguration, environment, bugs, edge cases, or inexperience.
          }
        }));
      }
    }
  }));

  await Promise.all(promisesToWaitOn);
};
