import bcrypt from "bcrypt";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import express, {Request, Response} from "express";
import {createReadStream} from "fs";
import https from "https";
import {join} from "path";
import pug, {compileTemplate, LocalsObject} from "pug";
import {Photo, PhotoDirectory, Video} from "./library";
import {User} from "./user";

declare global {
  namespace Express {
    export interface Request {
      user: User;
    }
  }
}

export const startServer = (
  {
    clientPath,

    authentication,

    SSL,
    port,

    videos,
    photosRoot,
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
  }
) => {
  return new Promise(onServerListening => {
    const unauthenticated = express();
    unauthenticated.use(cookieParser());

    const globalPageVariables = {};
    const LandingPage = pug.compileFile(join(clientPath, "landing", "index.pug"));
    const LoginPage = pug.compileFile(join(clientPath, "login", "index.pug"));
    const VideoPage = pug.compileFile(join(clientPath, "video", "index.pug"));
    const PhotoPage = pug.compileFile(join(clientPath, "photo", "index.pug"));
    const sendPage = (res: Response, page: compileTemplate, locals: LocalsObject, status: number = 200) => res
      .status(status)
      .contentType("text/html").send(page({
        ...globalPageVariables,
        ...locals,
      }));

    // Static client.
    unauthenticated.use("/static", express.static(clientPath, {
      dotfiles: "allow",
      etag: false,
      index: false,
      lastModified: false,
    }));

    // Session implementation.
    const SESSION_NAME = "CabinetSession";
    const sessions = new Map<string, User>();
    const generateSession = () => crypto.randomBytes(10).toString("hex");
    const authenticateWithSession = (id: string) => sessions.get(id);


    // Login API.
    const getLoginRedirect = (req: Request) => req.query.from && req.query.from[0] === "/" ? req.query.from : "/";
    unauthenticated.get("/login", (req, res) => {
      if (authentication) {
        return sendPage(res, LoginPage, {});
      }
      return res.redirect(getLoginRedirect(req));
    });
    unauthenticated.post("/login", bodyParser.urlencoded({
      extended: false,
      parameterLimit: 2,
    }), async (req, res) => {
      const from = getLoginRedirect(req);
      const username = req.body.username;
      const password = req.body.password;

      if (authentication) {
        if (typeof username != "string" || typeof password != "string") {
          return res.status(400).end();
        }

        const user = authentication.users.find(u => u.username === username);
        if (!user || !await bcrypt.compare(password, user.password)) {
          return sendPage(res, LoginPage, {
            error: "Unknown username or password",
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
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

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
      res.cookie(SESSION_NAME, "", {
        expires: new Date(2000, 0, 1),
        httpOnly: true,
      });
      return res.redirect(`/login?from=${encodeURIComponent(req.originalUrl)}`);
    });

    // Static client.
    authenticated.get("/", (req, res) =>
      sendPage(res, LandingPage, {}));
    authenticated.get("/video", (req, res) =>
      sendPage(res, VideoPage, {
        videos: videos.map((v, i) => ({
          id: i,
          title: v.title,
          favourite: authentication ? req.user.favouriteVideos.has(v.relativePath) : false,
        })),
      }));
    // Photo folder or file.
    authenticated.get(/^\/photo(\/?|.*)$/, (req, res) => {
      const pathComponents = req.params[0].split("/").filter(p => p);
      let entry: Photo | PhotoDirectory | undefined = photosRoot;
      while (entry && entry.isDirectory && pathComponents.length) {
        const name = pathComponents.shift()!;
        entry = entry.entries[name];
      }
      if (!entry || pathComponents.length > 1) {
        return res.status(404).end();
      }
      if (entry.isDirectory) {
        return sendPage(res, PhotoPage, {
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

    // Favourite videos.
    if (authentication) {
      authenticated.put("/user/video/favourites/:videoId", (req, res) => {
        const video = videos[req.params.videoId];
        if (!video) {
          return res.status(404).end();
        }
        req.user.favouriteVideos.add(video);
        authentication.writeUser(req.user);
        return res.end();
      });
      authenticated.delete("/user/video/favourites/:videoId", (req, res) => {
        const video = videos[req.params.videoId];
        if (!video) {
          return res.status(404).end();
        }
        req.user.favouriteVideos.delete(video);
        authentication.writeUser(req.user);
        return res.end();
      });
    }

    // Stream video.
    authenticated.get("/stream/:videoId", (req, res) => {
      const video = videos[req.params.videoId];
      if (!video) {
        return res.status(404).end();
      }

      const {absolutePath, size: total} = video;
      if (total < 1) {
        return res.status(500).end(`File is empty`);
      }

      let start: number;
      let end: number;

      const range = req.headers.range;
      if (range) {
        const rangeParts = /^bytes=(0|[1-9][0-9]*)-(0|[1-9][0-9]*)?$/.exec(range);
        if (!rangeParts) {
          return res.status(400).end(`Invalid range`);
        }
        start = Number.parseInt(rangeParts[1], 10);
        end = rangeParts[2] ? Number.parseInt(rangeParts[2], 10) : total - 1;
      } else {
        start = 0;
        end = total - 1;
      }

      const size = (end - start) + 1;
      if (start < 0 || start > end || end < 1 || end >= total || size < 1) {
        return res.status(404).end(`Invalid range: ${start}-${end}`);
      }

      res.status(206).set({
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": size,
        "Content-Type": video.type,
      });

      const stream = createReadStream(absolutePath, {start, end, autoClose: true});
      stream.on("error", err => err.status(500).end(`Internal streaming error: ${err}`));
      stream.pipe(res);
      req.on("close", () => stream.destroy());
      return;
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
