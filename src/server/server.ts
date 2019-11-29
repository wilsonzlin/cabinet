import bcrypt from 'bcrypt';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import express, {Request, Response} from 'express';
import {createReadStream, promises as fs} from 'fs';
import https from 'https';
import bcd from 'mdn-browser-compat-data';
import {SimpleSupportStatement} from 'mdn-browser-compat-data/types';
import {dirname, join} from 'path';
import pug, {compileTemplate, LocalsObject} from 'pug';
import useragent from 'useragent';
import {Photo, PhotoDirectory, Video} from './library';
import {DefaultVideoPreferences, hasProp, User} from './user';

declare global {
  namespace Express {
    export interface Request {
      user: User;
    }
  }
}

// When Cabinet is compiled, it builds up to two versions of static assets (e.g. JavaScript files),
// one potentially slower but compatible with more browsers, and one optimised for latest browsers.
//
// The server will set asset URLs in the HTML to point to either version depending on whether it
// thinks the client will be able to support newer features.
//
// It does this by parsing the User-Agent header, determining the browser version, and using
// compatibility data provided by mdn-browser-compat-data to guess with high chance that the client
// supports features listed in FEATURE_SUPPORT_REQUIREMENTS and will be fine if served with
// optimised assets.
const FEATURE_SUPPORT_REQUIREMENTS = [
  bcd.javascript.builtins.Object.fromEntries,
];

const notUndefined = <T> (val: T | undefined): val is T => val != undefined;

const getMajorFromSemVer = (semVer: string): number => Number.parseInt(semVer.split('.', 1)[0], 10);

const shouldUseCompatAssets = (ua: string | undefined): boolean => {
  if (ua === undefined) {
    return true;
  }

  const parsed = useragent.parse(ua);
  const family = parsed.family.toLowerCase().replace(/ /g, '_');
  const version = Number.parseInt(parsed.major, 10);

  return !FEATURE_SUPPORT_REQUIREMENTS.every(feat =>
    Array<SimpleSupportStatement | undefined>()
      .concat(feat.__compat?.support?.[family])
      .filter(notUndefined)
      .some(stmt =>
        (stmt.version_added === true || stmt.version_added && version >= getMajorFromSemVer(stmt.version_added))
        && (!stmt.version_removed || stmt.version_removed !== true && version < getMajorFromSemVer(stmt.version_removed))));
};

const streamVideo = (req: Request, res: Response, path: string, fileSize: number, type: string): void => {
  let start: number;
  let end: number;

  const range = req.headers.range;
  if (range) {
    const rangeParts = /^bytes=(0|[1-9][0-9]*)-(0|[1-9][0-9]*)?$/.exec(range);
    if (!rangeParts) {
      return res.status(400).end(`Invalid range`);
    }
    start = Number.parseInt(rangeParts[1], 10);
    end = rangeParts[2] ? Number.parseInt(rangeParts[2], 10) : fileSize - 1;
  } else {
    start = 0;
    end = fileSize - 1;
  }

  const streamLength = (end - start) + 1;
  if (start < 0 || start > end || end < 1 || end >= fileSize || streamLength < 1) {
    return res.status(404).end(`Invalid range: ${start}-${end}`);
  }

  res.status(206).set({
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': streamLength,
    'Content-Type': type,
  });

  const stream = createReadStream(path, {start, end, autoClose: true});
  stream.on('error', err => err.status(500).end(`Internal streaming error: ${err}`));
  stream.pipe(res);
  req.on('close', () => stream.destroy());
};

export const startServer = (
  {
    clientPath,

    authentication,

    SSL,
    port,

    videos,
    photosRoot,
    previewsDirectory,
  }: {
    clientPath: string;

    authentication?: {
      users: User[];
      writeUser: (user: User) => Promise<void>;
    };

    SSL?: {
      key: Buffer;
      certificate: Buffer;
      DHParameters?: Buffer;
    };
    port: number;

    videos: Video[];
    photosRoot: PhotoDirectory;
    previewsDirectory?: string;
  },
) => {
  return new Promise(onServerListening => {
    const unauthenticated = express();
    unauthenticated.use(cookieParser());

    const LandingPage = pug.compileFile(join(clientPath, 'landing', 'index.pug'));
    const LoginPage = pug.compileFile(join(clientPath, 'login', 'index.pug'));
    const VideoPage = pug.compileFile(join(clientPath, 'video', 'index.pug'));
    const PhotoPage = pug.compileFile(join(clientPath, 'photo', 'index.pug'));
    const sendPage = (req: Request, res: Response, page: compileTemplate, locals: LocalsObject, status: number = 200) => res
      .status(status)
      .contentType('text/html').send(page({
        ...locals,
        _signedIn: !!authentication,
        _useCompatAssets: shouldUseCompatAssets(req.headers['user-agent']),
      }));

    // Static client.
    unauthenticated.use('/static', express.static(clientPath, {
      dotfiles: 'allow',
      etag: false,
      index: false,
      lastModified: false,
    }));

    // Session implementation.
    const SESSION_NAME = 'CabinetSession';
    const sessions = new Map<string, User>();
    const generateSession = () => crypto.randomBytes(10).toString('hex');
    const authenticateWithSession = (id: string) => sessions.get(id);

    // Login API.
    const getLoginRedirect = (req: Request) => req.query.from && req.query.from[0] === '/' ? req.query.from : '/';
    unauthenticated.get('/login', (req, res) => {
      if (authentication) {
        return sendPage(req, res, LoginPage, {});
      }
      return res.redirect(getLoginRedirect(req));
    });
    unauthenticated.post('/login', bodyParser.urlencoded({
      extended: false,
      parameterLimit: 2,
    }), async (req, res) => {
      const from = getLoginRedirect(req);
      const username = req.body.username;
      const password = req.body.password;

      if (authentication) {
        if (typeof username != 'string' || typeof password != 'string') {
          return res.status(400).end();
        }

        const user = authentication.users.find(u => u.username === username);
        if (!user || !await bcrypt.compare(password, user.password)) {
          return sendPage(req, res, LoginPage, {
            error: 'Unknown username or password',
          }, 401);
        }

        const sessionId = generateSession();
        sessions.set(sessionId, user);
        res.cookie(SESSION_NAME, sessionId, {
          httpOnly: true,
        });
      }

      return res.redirect(from);
    });

    // Authenticated APIs.
    const authenticated = express.Router();
    unauthenticated.use(authenticated);
    authenticated.use(cookieParser(), (req, res, next) => {
      // Disable caching.
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // No authentication required.
      if (!authentication) {
        return next();
      }

      // Get user from session.
      const sessionId = req.cookies[SESSION_NAME];
      const user = authenticateWithSession(sessionId);
      if (user) {
        req.user = user;
        return next();
      }

      // Reject session.
      res.cookie(SESSION_NAME, '', {
        expires: new Date(2000, 0, 1),
        httpOnly: true,
      });
      return res.redirect(`/login?from=${encodeURIComponent(req.originalUrl)}`);
    });

    // Static client.
    authenticated.get('/', (req, res) =>
      sendPage(req, res, LandingPage, {}));
    // Video app.
    authenticated.get('/video', (req, res) => {
      const videosByDir = videos.reduce((folders, v, i) => {
        const folderName = dirname(v.relativePath);
        if (!folders.has(folderName)) {
          folders.set(folderName, []);
        }
        folders.get(folderName)!.push({
          id: i,
          title: v.title,
          liked: !!(authentication && req.user.likedVideos.has(v.relativePath)),
          disliked: !!(authentication && req.user.dislikedVideos.has(v.relativePath)),
          preview: previewsDirectory ? {
            thumbnail: `/video/${i}/thumb/50`,
            snippet: `/video/${i}/snippet`,
          } : undefined,
        });
        return folders;
      }, new Map<string, {
        id: number;
        title: string;
        liked: boolean;
        disliked: boolean;
        preview?: {
          thumbnail: string;
          snippet: string;
        };
      }[]>());

      return sendPage(req, res, VideoPage, {
        preferences: authentication && req.user.videoPreferences || DefaultVideoPreferences,
        folders: [...videosByDir.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([folder, videos]) => ({
            name: folder,
            videos: videos,
          })),
      });
    });
    // Photo folder or file.
    authenticated.get(/^\/photo(\/?|.*)$/, (req, res) => {
      const pathComponents = req.params[0].split('/').filter(p => p);
      let entry: Photo | PhotoDirectory | undefined = photosRoot;
      while (entry && entry.isDirectory && pathComponents.length) {
        const name = pathComponents.shift()!;
        entry = entry.entries[name];
      }
      if (!entry || pathComponents.length > 1) {
        return res.status(404).end();
      }
      if (entry.isDirectory) {
        return sendPage(req, res, PhotoPage, {
          name: entry.name,
          photos: entry.photos.map(p => ({
            name: p.name,
            path: p.relativePath,
            height: p.height,
            width: p.width,
          })),
          folders: entry.subdirectories.map(f => ({
            name: f.name,
            path: f.relativePath,
          })),
        });
      }
      return res.sendFile(entry.absolutePath);
    });

    // Video app APIs.
    if (authentication) {
      authenticated.post('/user/video/:videoId/like', (req, res) => {
        const video: Video = videos[req.params.videoId];
        if (!video) {
          return res.status(404).end();
        }
        const videoPath = video.relativePath;
        if (!req.user.likedVideos.delete(videoPath)) {
          req.user.likedVideos.add(videoPath);
        }
        authentication.writeUser(req.user);
        return res.json({liked: req.user.likedVideos.has(videoPath)});
      });
      authenticated.post('/user/video/:videoId/dislike', (req, res) => {
        const video: Video = videos[req.params.videoId];
        if (!video) {
          return res.status(404).end();
        }
        const videoPath = video.relativePath;
        if (!req.user.dislikedVideos.delete(videoPath)) {
          req.user.dislikedVideos.add(videoPath);
        }
        authentication.writeUser(req.user);
        return res.json({disliked: req.user.dislikedVideos.has(videoPath)});
      });
      authenticated.put('/user/video/preferences/:prefId', bodyParser.json({
        strict: true,
      }), (req, res) => {
        const preference = req.params.prefId;
        if (!hasProp(req.user.videoPreferences, preference)) {
          return res.status(404).end();
        }
        // TODO Validate
        req.user.videoPreferences[preference] = req.body.value;
        authentication.writeUser(req.user);
        return res.end();
      });
    }

    // Stream video.
    if (previewsDirectory) {
      authenticated.get('/video/:videoId/thumb/:thumbPos', (req, res) => {
        const video: Video = videos[req.params.videoId];
        if (!video) {
          return res.status(404).end();
        }

        const pos = req.params.thumbPos;
        if (!/^[0-9]{1,2}$/.test(pos)) {
          return res.status(404).end();
        }

        const {relativePath} = video;

        res.sendFile(join(
          previewsDirectory,
          relativePath,
          `thumb${req.params.thumbPos}.jpg`,
        ));
      });
      authenticated.get('/video/:videoId/montage', async (req, res) => {
        const video: Video = videos[req.params.videoId];
        if (!video) {
          return res.status(404).end();
        }

        const {relativePath} = video;

        res.sendFile(join(
          previewsDirectory,
          relativePath,
          `montage.jpg`,
        ));
      });
      authenticated.get('/video/:videoId/snippet', async (req, res) => {
        const video: Video = videos[req.params.videoId];
        if (!video) {
          return res.status(404).end();
        }

        const {relativePath} = video;

        const snippetPath = join(previewsDirectory, relativePath, 'snippet.mp4');
        let size;
        try {
          size = (await fs.stat(snippetPath)).size;
        } catch (err) {
          if (err.code === 'ENOENT') {
            return res.status(404).end();
          }
          throw err;
        }

        return streamVideo(req, res, snippetPath, size, 'video/mp4');
      });
    }
    authenticated.get('/stream/:videoId', (req, res) => {
      const video = videos[req.params.videoId];
      if (!video) {
        return res.status(404).end();
      }

      const {absolutePath, size, type} = video;
      if (size < 1) {
        return res.status(500).end(`File is empty`);
      }

      return streamVideo(req, res, absolutePath, size, type);
    });

    // Start server
    if (SSL) {
      https.createServer({
        key: SSL.key,
        cert: SSL.certificate,
        dhparam: SSL.DHParameters,
      }, unauthenticated).listen(port, () => onServerListening());
    } else {
      unauthenticated.listen(port, () => onServerListening());
    }

    // Don't save on process termination, as it's possible for data to be
    // corrupted due to writing near process/system termination.
  });
};
