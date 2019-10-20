import minimist from "minimist";
import {join} from "path";
import {listPhotos, listVideos} from "./server/library";
import {startServer} from "./server/server";
import {getUsers, writeUser} from "./server/user";

const args = minimist(process.argv.slice(2));

const LIBRARY_DIR: string = args.library;
const USERS_DIR: string = args.users;
const VIDEO_EXTENSIONS: string[] = (args.video || "mp4").split(",");
const PHOTO_EXTENSIONS: string[] = (args.photo || "png,gif,jpg,jpeg,bmp,svg,tif,tiff,webp").split(",");
const PORT: number = args.port || Math.floor(Math.random() * 8976 + 1024);
const SSL_KEY: string | undefined = args.key;
const SSL_CERT: string | undefined = args.cert;
const SSL_DHPARAM: string | undefined = args.dh;

(async function () {
  const [photosRoot, users, videos] = await Promise.all([
    listPhotos(LIBRARY_DIR, PHOTO_EXTENSIONS, LIBRARY_DIR),
    getUsers(USERS_DIR),
    listVideos(LIBRARY_DIR, VIDEO_EXTENSIONS),
  ]);

  await startServer({
    SSL: !SSL_KEY || !SSL_CERT ? undefined : {
      certificate: SSL_CERT,
      key: SSL_KEY,
      DHParameters: SSL_DHPARAM,
    },
    clientPath: join(__dirname, "client"),
    photosRoot,
    port: PORT,
    users,
    videos,
    writeUser: user => writeUser(USERS_DIR, user),
  });

  console.log(`Server started on port ${PORT}`);
})();
