import {execFile, spawn} from 'child_process';
import {cpus} from 'os';
import readdirp from 'readdirp';
import {join} from 'path';
import {promises as fs} from 'fs';
import PromiseQueue = require('promise-queue');
import mkdirp = require('mkdirp');

const nullStat = async (path: string) => {
  try {
    return await fs.stat(path);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
};

const isFile = async (path: string) => (await nullStat(path))?.isFile();

const emptyFile = async (path: string) => fs.writeFile(path, '');

const cmd = async (command: string, ...args: (string | number)[]): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile(command, args.map(String), (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else if (stderr) {
        reject(new Error(`stderr: ${stderr}`));
      } else {
        resolve(stdout);
      }
    }));

const job = async (command: string, errorOnBadStatus?: boolean, ...args: (string | number)[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const proc = spawn(command, args.map(String), {stdio: ['ignore', 'inherit', 'inherit']});
    proc.on('close', code => {
      if (code !== 0 && errorOnBadStatus) {
        reject(new Error(`Command failed with status ${code}: ${command}`));
      } else {
        resolve();
      }
    });
  });

const ensureDir = (dir: string) => new Promise((resolve, reject) =>
  mkdirp(dir, err => {
    if (err) {
      reject(err);
    } else {
      resolve();
    }
  }));

const ff = async (...args: (string | number)[]): Promise<void> =>
  job(`ffmpeg`, false, `-loglevel`, 0, `-hide_banner`, `-y`, ...args);

export const buildVideoPreviews = async ({
  libraryDir,
  previewsDir,
  concurrency = cpus().length,
  fileExtensions,
  thumbnailPercentiles = [50],
  snippetDuration = 5,
}: {
  libraryDir: string,
  previewsDir: string,
  concurrency?: number,
  fileExtensions: string[],
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

  const filesStream = await readdirp.promise(libraryDir, {
    depth: Infinity,
    fileFilter: entry => fileExtensions.includes(entry.basename.slice(entry.basename.lastIndexOf('.') + 1)),
  });

  await Promise.all(filesStream.map(async (file) => {
    const absPath = file.fullPath;
    const relPath = file.path;
    const outDir = join(previewsDir, relPath);
    const filePromises: Promise<any>[] = [];

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
      console.error(`Failed to retrieve duration for "${relPath}"`);
      console.error(err);
      return;
    }

    // Create thumbnails at percentiles.
    for (const percentile of thumbnailPercentiles) {
      const thumbPos = (duration * percentile / 100).toFixed(2);
      const thumbDest = join(outDir, `thumb${percentile}.jpg`);
      if (await isFile(thumbDest)) {
        console.info(`${percentile}% thumbnail exists for "${relPath}"`);
      } else {
        filePromises.push(queueWaitable(() => ff(
          `-ss`, thumbPos,
          `-i`, absPath,
          `-vframes`, 1,
          `-q:v`, 2,
          thumbDest,
        )));
      }
    }

    // Create preview snippet.
    const snippetPos = Math.max(0, duration * 0.5 - (snippetDuration / 2));
    const snippetDest = join(outDir, 'snippet.mp4');
    if (await isFile(snippetDest)) {
      console.info(`Snippet exists for "${relPath}"`);
    } else {
      filePromises.push(queueWaitable(() => ff(
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
      )));
    }

    // Create montage.
    const montageDest = join(outDir, 'montage.jpg');
    const nomontage = join(outDir, '.nomontage');

    if (await isFile(nomontage) || await isFile(montageDest)) {
      console.info(`Montage exists or is disabled for "${relPath}"`);
    } else {
      // We want to get a shot every 2 seconds except for first and last 2 seconds, up to 200 shots.
      // More granularity would probably not be much use and exceed JPEG dimension limits.
      const montageGranularity = Math.floor(Math.min(200, duration / 2));

      if (montageGranularity <= 2) {
        // Video is too short for a montage, so don't create one.
        await emptyFile(nomontage);
        console.info(`Video "${relPath}" is too short for montage`);
        return;
      }

      const montageShots: string[] = [];
      let montageFailed = false;
      const montageShotPromises: Promise<any>[] = [];

      // Ignore first and last shots.
      for (let montageShotNo = 1; montageShotNo < montageGranularity; montageShotNo++) {
        const montageShotPos = (duration * montageShotNo / montageGranularity).toFixed(2);
        // Avoid using subdirectories that might cause race conditions when creating and deleting concurrently.
        const montageShotDest = join(outDir, `montageshot${montageShotNo}.jpg`);
        montageShots.push(montageShotDest);

        montageShotPromises.push(queueWaitable(async () => {
          if (montageFailed || !(await isFile(montageShotDest))) {
            return;
          }

          await ff(
            `-ss`, montageShotPos,
            `-i`, absPath,
            `-vframes`, 1,
            `-q:v`, 2,
            montageShotDest,
          );

          const stats = await nullStat(montageShotDest);
          if (!stats || !stats.size) {
            // Montage shot failed to be created. Don't create montage and don't try again in future.
            // Keep empty shot file so that which shots failed are known.
            montageFailed = true;
          }
        }));
      }

      // Don't put this in queue, as it depends on other queued promises.
      promisesToWaitOn[promisesToWaitOn.length - 1] =
        filePromises[filePromises.length - 1] =
          Promise.all(montageShotPromises).then(async () => {
            if (montageFailed) {
              await emptyFile(nomontage);
            } else {
              // Make sure to await, as by this time promisesToWaitOn has already been Promise.all'd.
              await queueWaitable(() => job(`convert`, true, ...montageShots, `+append`, `-resize`, `x120`, montageDest));
              await Promise.all(montageShots.map(s => fs.unlink(s)));
            }
          });
    }

    Promise.all(filePromises)
      .then(() => console.log(`Processed "${relPath}"`));
  }));

  await Promise.all(promisesToWaitOn);
};
