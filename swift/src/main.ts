#!/usr/bin/env node

import {mapOptional} from 'extlib/js/optional/map';
import {promises as fs, realpathSync} from 'fs';
import minimist from 'minimist';
import ora from 'ora';
import {cpus} from 'os';
import {join} from 'path';
import {createLibrary} from './library/build';
import {startServer} from './server/server';
import {getUsers, writeUser} from './server/user';
import {buildVideoPreviews} from './tool/buildVideoPreviews';
import {convertVideos} from './tool/convertVideos';

const args = minimist(process.argv.slice(2));

const rp = (p: string): string => realpathSync(p);

const LIBRARY_DIR: string | undefined = mapOptional(args.library, rp);
const USERS_DIR: string | undefined = mapOptional(args.users, rp);
const SOURCE_DIR: string | undefined = mapOptional(args.source, rp);
const PREVIEWS_DIR: string | undefined = mapOptional(args.previews, rp);
const SCRATCH_DIR: string | undefined = mapOptional(args.scratch, rp);
const VIDEO_EXTENSIONS: Set<string> = new Set((args.video || 'mp4,m4v').split(','));
const PHOTO_EXTENSIONS: Set<string> = new Set((args.photo || 'png,gif,jpg,jpeg,bmp,svg,tif,tiff,webp').split(','));
const INCLUDE_HIDDEN_FILES: boolean = args.hidden ?? false;
const CONCURRENCY: number = +args.concurrency || cpus().length;
const PORT: number = args.port || Math.floor(Math.random() * 8976 + 1024);
const SSL_KEY: string | undefined = args.key;
const SSL_CERT: string | undefined = args.cert;
const SSL_DHPARAM: string | undefined = args.dh;

if (args['build-video-previews']) {
  if (!PREVIEWS_DIR) {
    throw new Error(`No preview directory provided`);
  }
  if (!LIBRARY_DIR) {
    throw new Error(`No library directory provided`);
  }
  buildVideoPreviews({
    previewsDir: PREVIEWS_DIR,
    libraryDir: LIBRARY_DIR,
    fileExtensions: VIDEO_EXTENSIONS,
    includeHiddenFiles: INCLUDE_HIDDEN_FILES,
    concurrency: CONCURRENCY,
  }).then(() => process.exit(0), console.error);

} else if (args['convert-videos']) {
  if (!SOURCE_DIR) {
    throw new Error(`No source directory provided`);
  }
  convertVideos({
    sourceDir: SOURCE_DIR,
    convertedDir: rp(args.converted),
    includeHiddenFiles: INCLUDE_HIDDEN_FILES,
    concurrency: CONCURRENCY,
  }).then(() => process.exit(0), console.error);

} else {
  (async () => {
    if (!LIBRARY_DIR) {
      throw new Error(`No library directory provided`);
    }
    const spinner = ora('Finding videos and photos').start();
    const users = USERS_DIR ? await getUsers(USERS_DIR) : [];
    await startServer({
      clientPath: join(__dirname, 'client'),
      SSL: !SSL_KEY || !SSL_CERT ? undefined : {
        certificate: await fs.readFile(SSL_CERT),
        key: await fs.readFile(SSL_KEY),
        DHParameters: SSL_DHPARAM ? await fs.readFile(SSL_DHPARAM) : undefined,
      },
      library: await createLibrary({
        spinner,
        includeHiddenFiles: INCLUDE_HIDDEN_FILES,
        previewsDir: PREVIEWS_DIR,
        videoExtensions: VIDEO_EXTENSIONS,
        photoExtensions: PHOTO_EXTENSIONS,
        rootDir: LIBRARY_DIR,
      }),
      port: PORT,
      authentication: users.length ? {
        users,
        writeUser: user => writeUser(USERS_DIR!, user),
      } : undefined,
      scratch: SCRATCH_DIR,
    });
    spinner.succeed(`Server started on port ${PORT}`).stop();
  })().catch(console.error);
}
