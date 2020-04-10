#!/usr/bin/env node

import {promises as fs, realpathSync} from 'fs';
import minimist from 'minimist';
import {cpus} from 'os';
import {join} from 'path';
import {listPhotos, listVideos} from './server/library';
import {startServer} from './server/server';
import {getUsers, writeUser} from './server/user';
import {buildVideoPreviews} from './tool/buildVideoPreviews';
import {convertVideos} from './tool/convertVideos';

const args = minimist(process.argv.slice(2));

const rp = (p: string): string => realpathSync(p);

const optionalMap = <T, R> (val: T | null | undefined, mapper: (val: T) => R) => val == null ? undefined : mapper(val);

const LIBRARY_DIR: string = rp(args.library);
const USERS_DIR: string | undefined = optionalMap(args.users, rp);
const PREVIEWS_DIR: string | undefined = optionalMap(args.previews, rp);
const VIDEO_EXTENSIONS: Set<string> = new Set((args.video || 'mp4,m4v').split(','));
const PHOTO_EXTENSIONS: Set<string> = new Set((args.photo || 'png,gif,jpg,jpeg,bmp,svg,tif,tiff,webp').split(','));
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
    concurrency: CONCURRENCY,
  }).then(() => process.exit(0), console.error);

} else if (args['convert-videos']) {
  // Sometimes Node.js keeps running after all video conversion jobs have completed, so force exit on Promise fulfilment.
  convertVideos({
    sourceDir: LIBRARY_DIR,
    convertedDir: rp(args.converted),
    concurrency: CONCURRENCY,
  }).then(() => process.exit(0), console.error);

} else {
  (async () => {
    const [photosRoot, users, videos] = await Promise.all([
      listPhotos(LIBRARY_DIR, PHOTO_EXTENSIONS, LIBRARY_DIR),
      USERS_DIR ? getUsers(USERS_DIR) : [],
      listVideos(LIBRARY_DIR, VIDEO_EXTENSIONS, PREVIEWS_DIR),
    ]);
    return startServer({
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
    });
  })().then(() => console.log(`Server started on port ${PORT}`), console.error);
}
