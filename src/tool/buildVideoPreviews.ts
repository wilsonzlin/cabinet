import {exec, spawn} from 'child_process';
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

const cmd = async (command: string): Promise<string> => new Promise((resolve, reject) =>
  exec(command, (error, stdout, stderr) => {
    if (error) {
      reject(error);
    } else if (stderr) {
      reject(new Error(`stderr: ${stderr}`));
    } else {
      resolve(stdout);
    }
  }));

const job = async (command: string): Promise<void> => new Promise((resolve, reject) => {
  const proc = spawn(command, {stdio: ['ignore', 'pipe', 'pipe']});
  proc.on('close', code => {
    if (code !== 0) {
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

const ff = async (...args: string[]): Promise<void> => job(`ffmpeg -loglevel 0 -hide_banner -y ${args.join(' ')}`);

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

  const filesStream = readdirp(libraryDir, {
    fileFilter: entry => fileExtensions.includes(entry.basename.slice(entry.basename.lastIndexOf('.') + 1)),
  });

  for await (const file of filesStream) {
    const absPath = file.fullPath;
    const relPath = file.path;
    const outDir = join(previewsDir, relPath);

    console.log(`Processing ${relPath}`);
    await ensureDir(outDir);

    // Get duration of video in seconds.
    const duration = Number.parseFloat(await cmd(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${absPath}"`,
    ));

    // Create thumbnails at percentiles.
    for (const percentile of thumbnailPercentiles) {
      const thumbPos = (duration * percentile / 100).toFixed(2);
      const thumbDest = join(outDir, `thumb${percentile}.jpg`);
      queueWaitable(() => ff(
        `-ss "${thumbPos}"`,
        `-i "${absPath}"`,
        `-vframes 1`,
        `-q:v 2 "${thumbDest}"`,
      ));
    }

    // Create preview snippet.
    const snippetPos = Math.max(0, duration * 0.5 - (snippetDuration / 2));
    const snippetDest = join(outDir, 'snippet.mp4');
    queueWaitable(() => ff(
      `-ss "${snippetPos}"`,
      `-i "${absPath}"`,
      `-filter:v scale="180:trunc(ow/a/2)*2"`,
      `-c:v libx264`,
      `-map_metadata -1`,
      `-preset veryslow`,
      `-crf 17`,
      `-max_muxing_queue_size 1048576`,
      `-movflags`,
      `+faststart`,
      `-an`,
      `-t "${snippetDuration}"`,
      `-f mp4`,
      `"${snippetDest}"`,
    ));

    // Create montage.
    const montageDest = join(outDir, 'montage.jpg');
    const nomontage = join(outDir, '.nomontage');

    if (await isFile(nomontage) || await isFile(montageDest)) {
      continue;
    }

    // We want to get a shot every 2 seconds except for first and last 2 seconds, up to 200 shots.
    // More granularity would probably not be much use and exceed JPEG dimension limits.
    const montageGranularity = Math.floor(Math.min(200, duration / 2));

    if (montageGranularity <= 2) {
      // Video is too short for a montage, so don't create one.
      await emptyFile(nomontage);
      continue;
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

      montageShotPromises.push(
        queueWaitable(() => ff(
          `-ss "${montageShotPos}"`,
          `-i "${absPath}"`,
          `-vframes 1`,
          `-q:v 2`,
          `"${montageShotDest}"`,
        ))
          .then(async () => {
            const stats = await nullStat(montageShotDest);
            if (!stats || !stats.size) {
              // Montage shot failed to be created. Don't create montage and don't try again in future.
              // Keep empty shot file so that no other concurrent scripts try to recreate it and which shots failed are known.
              montageFailed = true;
            }
          }),
      );
    }

    // Don't put this in queue, as it depends on other queued promises.
    promisesToWaitOn.push(Promise.all(montageShotPromises).then(async () => {
      if (montageFailed) {
        await emptyFile(nomontage);
      } else {
        // Make sure to await, as by this time promisesToWaitOn has already been Promise.all'd.
        await queueWaitable(() => job(
          `convert "${montageShots.map(s => s.replace(/\W/g, '\\$0')).join(' ')}" +append -resize x120 "${montageDest}"`,
        ).then(() => Promise.all(
          montageShots.map(s => fs.unlink(s))),
        ));
      }
    }));
  }

  await Promise.all(promisesToWaitOn);
};
