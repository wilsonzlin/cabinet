import readdirp from 'readdirp';
import {dirname, join} from 'path';
import {ensureDir, getExt, isFile, withoutExt} from '../util/fs';
import {ff} from '../util/ff';
import {promises as fs} from 'fs';
import {cmd} from '../util/exec';
import PromiseQueue = require('promise-queue');

const CONVERTABLE_VIDEO_EXTENSIONS = new Set([
  'wmv', 'mkv', 'avi', 'rm', 'rmvb', 'flv', '3gp',
]);

const SUPPORTED_VIDEO_CODECS = new Set([
  'h264',
]);

const getCodec = async (file: string): Promise<string> => {
  return (await cmd(
    `ffprobe`,
    `-v`, `error`,
    `-select_streams`, `v:0`,
    `-show_entries`, `stream=codec_name`,
    `-of`, `default=noprint_wrappers=1:nokey=1`,
    file,
  )).trim();
};

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

  const codec = await getCodec(absPath);

  if (SUPPORTED_VIDEO_CODECS.has(codec)) {
    if (verbose) {
      console.log(`${relPath} is already using supported video codec`);
    }
    await ff(
      `-i`, absPath,
      `-codec`, `copy`,
      `-map_metadata`, -1,
      `-movflags`,
      `+faststart`,
      `-f`, `mp4`,
      destPathIncomplete,
    );
  } else {
    if (verbose) {
      console.log(`${relPath} needs to be converted to H.264`);
    }
    await ff(
      `-i`, absPath,
      `-c:v`, `libx264`,
      `-map_metadata`, -1,
      `-preset`, `veryfast`,
      `-crf`, 17,
      `-max_muxing_queue_size`, 1048576,
      `-movflags`,
      `+faststart`,
      `-f`, `mp4`,
      destPathIncomplete,
    );
  }

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
