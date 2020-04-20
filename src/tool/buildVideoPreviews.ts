import ora from 'ora';
import {join} from 'path';
import ProgressBar from 'progress';
import readdirp from 'readdirp';
import {getDuration, screenshot, video} from '../util/ff';
import {ensureDir, getExt, isFile} from '../util/fs';
import PromiseQueue = require('promise-queue');

const generateSnippet = (src: string, out: string, startTime: number, duration: number): Promise<void> => video({
  input: {
    file: src,
    start: startTime,
  },
  metadata: false,
  video: {
    codec: 'libx264',
    faststart: true,
    crf: 17,
    preset: 'veryslow',
    resize: {width: 180},
  },
  audio: false,
  output: {
    file: out,
    format: 'mp4',
    duration: duration,
  },
});

type PromiseGeneratorWithStatus = [string, () => Promise<any>];

export const buildVideoPreviews = async ({
  libraryDir,
  previewsDir,
  concurrency,
  fileExtensions,
  snippetDuration = 5,
}: {
  libraryDir: string,
  previewsDir: string,
  concurrency: number,
  fileExtensions: Set<string>,
  snippetDuration?: number,
}): Promise<void> => {
  const spinner = ora('Finding videos').start();

  const files = await readdirp.promise(libraryDir, {
    depth: Infinity,
    fileFilter: entry => fileExtensions.has(getExt(entry.basename)),
  });

  const promises = (await Promise.all(files.map(async (file) => {
    const filePromises: PromiseGeneratorWithStatus[] = [];

    const absPath = file.fullPath;
    const relPath = file.path;
    const outDir = join(previewsDir, relPath);

    spinner.text = `Preparing ${relPath}`;

    await ensureDir(outDir);

    // Get duration of video in seconds.
    let duration: number;
    try {
      duration = await getDuration(absPath);
    } catch (err) {
      spinner.fail(`Failed to retrieve duration for ${relPath}: ${err.message}`).start();
      return filePromises;
    }

    // Create thumbnails at percentiles.
    const thumbDest = join(outDir, `thumb50.jpg`);
    if (!(await isFile(thumbDest))) {
      filePromises.push([`Generating thumbnail for ${relPath}`, () => screenshot(absPath, duration * 0.5, thumbDest)]);
    }

    // Create preview snippet.
    const snippetPos = Math.max(0, duration * 0.5 - (snippetDuration / 2));
    const snippetDest = join(outDir, 'snippet.mp4');
    if (!(await isFile(snippetDest))) {
      filePromises.push([`Generating snippet for ${relPath}`, () => generateSnippet(absPath, snippetDest, snippetPos, snippetDuration)]);
    }

    // Create montage.
    // We want to get a shot every 2 seconds.
    const montageShotCount = Math.floor(Math.min(200, duration / 2));

    const montageShots = await Promise.all(Array(montageShotCount).fill(void 0).map(async (_, no) => {
      const pos = Math.round(duration * no / montageShotCount);
      // Avoid using subdirectories that might cause race conditions when creating and deleting concurrently.
      const dest = join(outDir, `montageshot${pos}.jpg`);
      return {
        time: pos,
        file: dest,
        exists: await isFile(dest),
      };
    }));

    for (const {time, file, exists} of montageShots) {
      if (exists) {
        continue;
      }
      filePromises.push([`Generating montage for ${relPath}`, () => screenshot(absPath, time, file)]);
    }

    return filePromises;
  }))).flat();

  spinner.stop();

  const queue = new PromiseQueue(concurrency, Infinity);

  const progress = new ProgressBar('[:bar] :status', {
    total: promises.length,
    complete: '=',
    width: 15,
  });

  await Promise.all(promises.map(([status, promiseProducer]) =>
    queue.add(() => {
      progress.render({status});
      return promiseProducer();
    })
      .catch(err => progress.interrupt(err.message))
      .then(() => progress.tick())));
};
