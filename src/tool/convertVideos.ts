import {promises as fs} from 'fs';
import {dirname, join} from 'path';
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

const convertVideo = async (file: readdirp.EntryInfo, convertedDir: string, verbose?: boolean) => {
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

  const videoCodec = await getVideoCodec(absPath);
  const audioCodec = await getAudioCodec(absPath);

  let videoArgs;
  let audioArgs;

  if (SUPPORTED_VIDEO_CODECS.has(videoCodec)) {
    if (verbose) {
      console.debug(`${relPath} is already using supported video codec`);
    }
    videoArgs = [
      `-vcodec`, `copy`,
    ];
  } else {
    if (verbose) {
      console.debug(`${relPath} video needs to be converted to H.264`);
    }
    videoArgs = [
      `-c:v`, `libx264`,
      `-preset`, `veryfast`,
      `-crf`, 17,
    ];
  }

  if (SUPPORTED_AUDIO_CODECS.has(audioCodec)) {
    if (verbose) {
      console.debug(`${relPath} is already using supported audio codec`);
    }
    audioArgs = [
      `-acodec`, `copy`,
    ];
  } else {
    if (verbose) {
      console.debug(`${relPath} audio needs to be converted to AAC`);
    }
    audioArgs = [
      `-acodec`, `aac`,
    ];
  }

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
  verbose,
}: {
  sourceDir: string,
  convertedDir: string,
  concurrency: number,
  verbose?: boolean,
}): Promise<void> => {
  const queue = new PromiseQueue(concurrency, Infinity);

  const files = await readdirp.promise(sourceDir, {
    depth: Infinity,
    fileFilter: entry => CONVERTABLE_VIDEO_EXTENSIONS.has(getExt(entry.basename)),
  });

  await Promise.all(
    files.map(file =>
      queue.add(() =>
        convertVideo(file, convertedDir, verbose)
          .then(
            () => console.info(`Converted "${file.path}"`),
            err => console.error(`Failed to converted "${file.path}": ${err.message}`),
          ),
      ),
    ),
  );
};
