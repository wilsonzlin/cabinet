#!/usr/bin/env node

import {promises as fs, realpathSync} from 'fs';
import minimist from 'minimist';
import ora from 'ora';
import {cpus} from 'os';
import {join} from 'path';
import {listPhotos, listVideos} from './server/library';
import {startServer} from './server/server';
import {getUsers, writeUser} from './server/user';
import {buildVideoPreviews} from './tool/buildVideoPreviews';
import {convertVideos} from './tool/convertVideos';
import {optionalMap} from './util/lang';

const args = minimist(process.argv.slice(2));

const rp = (p: string): string => realpathSync(p);

const LIBRARY_DIR: string = rp(args.library);
const USERS_DIR: string | undefined = optionalMap(args.users, rp);
const SOURCE_DIR: string | undefined = optionalMap(args.source, rp);
const PREVIEWS_DIR: string | undefined = optionalMap(args.previews, rp);
const SCRATCH_DIR: string | undefined = optionalMap(args.scratch, rp);
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
    const spinner = ora('Finding videos and photos').start();
    const [photosRoot, users, videos] = await Promise.all([
      listPhotos(LIBRARY_DIR, PHOTO_EXTENSIONS, LIBRARY_DIR, INCLUDE_HIDDEN_FILES, spinner),
      USERS_DIR ? getUsers(USERS_DIR) : [],
      listVideos(LIBRARY_DIR, VIDEO_EXTENSIONS, INCLUDE_HIDDEN_FILES, PREVIEWS_DIR, spinner),
    ]);
    await startServer({
      SSL: !SSL_KEY || !SSL_CERT ? undefined : {
        certificate: await fs.readFile(SSL_CERT),
        key: await fs.readFile(SSL_KEY),
        DHParameters: SSL_DHPARAM ? await fs.readFile(SSL_DHPARAM) : undefined,
      },
      clientPath: join(__dirname, 'client'),
      photosRoot,
      port: PORT,
      authentication: users.length ? {
        users,
        writeUser: user => writeUser(USERS_DIR!, user),
      } : undefined,
      videos,
      scratch: SCRATCH_DIR,
    });
    spinner.succeed(`Server started on port ${PORT}`).stop();
  })().catch(console.error);
}
