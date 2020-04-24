import {promises as fs} from 'fs';
import ora from 'ora';
import {dirname, join} from 'path';
import ProgressBar from 'progress';
import readdirp from 'readdirp';
import {ffProbeVideo, ffVideo} from '../util/ff';
import {ensureDir, getExt, isFile, isHiddenFile, withoutExt} from '../util/fs';
import {asyncFilterList} from '../util/lang';
import PromiseQueue = require('promise-queue');

// TODO Configurable.
const CONVERTABLE_VIDEO_EXTENSIONS = new Set([
  'wmv', 'mkv', 'avi', 'rm', 'rmvb', 'flv', '3gp',
]);

// TODO Configurable.
const SUPPORTED_VIDEO_CODECS = new Set([
  'h264',
]);

// TODO Configurable.
const SUPPORTED_AUDIO_CODECS = new Set([
  'aac',
]);

const convertVideo = async (file: readdirp.EntryInfo, convertedDir: string) => {
  const absPath = file.fullPath;
  const relPath = file.path;
  // Get absolute path to converted output file with extension replaced with 'mp4'.
  const destPath = join(convertedDir, `${withoutExt(relPath)}.mp4`);

  // First convert to a temporary file so that if conversion does not finish successfully (e.g. script or system crashes),
  // when this script is run again, it will detect incompletion and restart the process.
  const destPathIncomplete = `${destPath}.incomplete`;

  await ensureDir(dirname(destPath));

  if (await isFile(destPath)) {
    return;
  }

  const properties = await ffProbeVideo(absPath);

  await ffVideo({
    input: {
      file: absPath,
    },
    metadata: false,
    video: SUPPORTED_VIDEO_CODECS.has(properties.videoCodec) || {
      codec: 'libx264',
      preset: 'veryfast',
      crf: 17,
      faststart: true,
    },
    audio: SUPPORTED_AUDIO_CODECS.has(properties.audioCodec) || {
      codec: 'aac',
    },
    output: {
      format: 'mp4',
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
  sourceDir: string,
  convertedDir: string,
  includeHiddenFiles: boolean,
  concurrency: number,
}): Promise<void> => {
  const queue = new PromiseQueue(concurrency, Infinity);

  const spinner = ora('Finding files to convert').start();

  const files = await readdirp.promise(sourceDir, {
    depth: Infinity,
    fileFilter: entry => CONVERTABLE_VIDEO_EXTENSIONS.has(getExt(entry.basename)),
  }).then(entries => asyncFilterList(entries, (async (e) => includeHiddenFiles || !(await isHiddenFile(e.fullPath)))));

  spinner.stop();

  const activeFiles = new Array<string>();
  const progress = new ProgressBar('[:bar] :status', {
    total: files.length,
    complete: '=',
    width: 15,
  });
  const updateProgress = (file: string, type: 'started' | 'completed') => {
    switch (type) {
    case 'started':
      activeFiles.push(file);
      break;
    case 'completed':
      progress.tick();
      activeFiles.splice(activeFiles.indexOf(file), 1);
      break;
    }
    const {0: first, length: n} = activeFiles;
    progress.render({
      status: `Converting ${first}${n == 1 ? '' : ` and ${n - 1} other file${n == 2 ? '' : 's'}`}`,
    });
  };

  await Promise.all(files.map(file => queue.add(async () => {
    updateProgress(file.path, 'started');
    try {
      await convertVideo(file, convertedDir);
    } catch (err) {
      progress.interrupt(`Failed to convert ${file.path}: ${err.message}`);
    }
    updateProgress(file.path, 'completed');
  })));
};
