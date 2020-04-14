import {promises as fs} from 'fs';
import ora from 'ora';
import {dirname, join} from 'path';
import ProgressBar from 'progress';
import readdirp from 'readdirp';
import {cmd} from '../util/exec';
import {ff} from '../util/ff';
import {ensureDir, getExt, isFile, withoutExt} from '../util/fs';
import PromiseQueue = require('promise-queue');

const CONVERTABLE_VIDEO_EXTENSIONS = new Set([
  'wmv', 'mkv', 'avi', 'rm', 'rmvb', 'flv', '3gp',
]);

const SUPPORTED_VIDEO_CODECS = new Set([
  'h264',
]);

const SUPPORTED_AUDIO_CODECS = new Set([
  'aac',
]);

const getStreamCodec = async (file: string, stream: 'v:0' | 'a:0'): Promise<string> => {
  return (await cmd(
    `ffprobe`,
    `-v`, `error`,
    `-select_streams`, stream,
    `-show_entries`, `stream=codec_name`,
    `-of`, `default=noprint_wrappers=1:nokey=1`,
    file,
  )).trim();
};

const getVideoCodec = async (file: string) => getStreamCodec(file, 'v:0');
const getAudioCodec = async (file: string) => getStreamCodec(file, 'a:0');

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

  const videoArgs = SUPPORTED_VIDEO_CODECS.has(await getVideoCodec(absPath)) ? [
    `-c:v`, `copy`,
  ] : [
    `-c:v`, `libx264`,
    `-preset`, `veryfast`,
    `-crf`, 17,
  ];
  const audioArgs = SUPPORTED_AUDIO_CODECS.has(await getAudioCodec(absPath)) ? [
    `-c:a`, `copy`,
  ] : [
    `-c:a`, `aac`,
  ];

  await ff(
    `-i`, absPath,
    `-map_metadata`, -1,
    `-max_muxing_queue_size`, 1048576,
    ...audioArgs,
    ...videoArgs,
    `-movflags`,
    `+faststart`,
    `-f`, `mp4`,
    destPathIncomplete,
  );

  await fs.rename(destPathIncomplete, destPath);
};

export const convertVideos = async ({
  sourceDir,
  convertedDir,
  concurrency,
}: {
  sourceDir: string,
  convertedDir: string,
  concurrency: number,
}): Promise<void> => {
  const queue = new PromiseQueue(concurrency, Infinity);

  const spinner = ora('Finding files to convert').start();

  const files = await readdirp.promise(sourceDir, {
    depth: Infinity,
    fileFilter: entry => CONVERTABLE_VIDEO_EXTENSIONS.has(getExt(entry.basename)),
  });

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
    const first = activeFiles[0];
    const n = activeFiles.length;
    progress.render({
      status: `Converting ${first}${n == 1 ? '' : ` and ${n - 1} other file${n == 2 ? '' : 's'}`}`,
    });
  };

  await Promise.all(
    files.map(file =>
      queue.add(() => {
        updateProgress(file.path, 'started');
        return convertVideo(file, convertedDir)
          .catch(err => progress.interrupt(`Failed to converted ${file.path}: ${err.message}`))
          .then(() => updateProgress(file.path, 'completed'));
      })),
  );
};
