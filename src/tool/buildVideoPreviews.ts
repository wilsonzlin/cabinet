import {exec, spawn} from 'child_process';
import {cpus} from 'os';
import readdirp from 'readdirp';
import PromiseQueue = require('promise-queue');
import mkdirp = require('mkdirp');

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
}: {
  libraryDir: string,
  previewsDir: string,
  concurrency?: number,
  fileExtensions: string[],
}): Promise<void> => {
  const queue = new PromiseQueue(concurrency, Infinity);

  const filesStream = readdirp(libraryDir, {
    fileFilter: entry => fileExtensions.includes(entry.basename.slice(entry.basename.lastIndexOf('.') + 1)),
  });
  for await (const file of filesStream) {
    const relPath = file.path;
    const duration = Number.parseFloat(await cmd(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file.fullPath}"`,
    ));
    console.log(`Processing ${file.path}`);
    await ensureDir(`${previewsDir}/${relPath}`);
  }
};
