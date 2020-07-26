import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import express from 'express';
import {hasKey} from 'extlib/js/object/has';
import https from 'https';
import {getFileApi} from '../api/getFile';
import {listFilesApi} from '../api/listFiles';
import {authenticateRequest, SESSION_NAME, signInApi} from '../api/signIn';
import {Library} from '../library/model';
import {Context} from './context';
import {applyResponse, maybeInterceptResponse} from './response';
import {User} from './user';

export const startServer = ({
  clientPath,
  authentication,
  SSL,
  port,
  library,
  scratch,
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
  library: Library;
  scratch?: string;
}) => new Promise(onServerListening => {
  const ctx: Context = {
    library,
    authentication: authentication && {
      ...authentication,
      sessions: new Map(),
    },
    scratch,
    user: undefined as any,
  };

  const unauthenticated = express();
  unauthenticated.set('query parser', 'simple');
  unauthenticated.use(cookieParser());

  unauthenticated.use('/', express.static(clientPath, {
    dotfiles: 'allow',
    etag: false,
    lastModified: false,
  }));

  // Login API.
  unauthenticated.post('/login', bodyParser.urlencoded({
    extended: false,
    parameterLimit: 2,
  }), async (req, res) => {
    applyResponse(req, res, await signInApi({
      ctx,
      username: req.body.username,
      password: req.body.password,
    }));
  });

  // Authenticated APIs.
  const authenticated = express.Router();
  unauthenticated.use(authenticated);
  authenticated.use(cookieParser(), (req, res, next) => {
    maybeInterceptResponse(req, res, next, authenticateRequest({
      ctx,
      sessionId: req.cookies[SESSION_NAME],
    }));
  });

  authenticated.get(/^\/files\/(.*)$/, (req, res) => {
    applyResponse(req, res, listFilesApi({
      ctx,
      // TODO Decode path
      path: req.params[0],
      filter: req.query.filter,
      subdirectories: req.query.subdirectories === '1',
    }));
  });
  authenticated.get(/^\/file\/(.*)$/, async (req, res) => {
    applyResponse(req, res, await getFileApi({
      ctx,
      // TODO Decode path
      path: req.params[0],
      thumbnail: req.query.thumbnail === '1',
      snippet: req.query.snippet === '1',
      montageFrame: req.query.montageframe,
      start: req.query.start,
      end: req.query.end,
      type: req.query.type,
      silent: req.query.silent === '1',
    }));
  });

  // Video app APIs.
  if (authentication) {
    authenticated.put(/^\/user\/rating\/(.*)$/, bodyParser.json({
      strict: true,
    }), (req, res) => {
      const file = ctx.library.getFile(req.params[0]);
      if (!file) {
        return res.status(404).end();
      }
      // TODO Validate
      ctx.user.ratings[file.relativePath] = req.body.rating;
      authentication.writeUser(ctx.user);
      return res.end();
    });
    authenticated.put('/user/video/preferences/:prefId', bodyParser.json({
      strict: true,
    }), (req, res) => {
      const preference = req.params.prefId;
      if (!hasKey(ctx.user.videoPreferences, preference)) {
        return res.status(404).end();
      }
      // TODO Validate
      ctx.user.videoPreferences[preference] = req.body.value;
      authentication.writeUser(ctx.user);
      return res.end();
    });
  }

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
