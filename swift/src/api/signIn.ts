import bcrypt from 'bcrypt';
import crypto from 'crypto';
import {Context} from '../server/context';
import {OK, Status, WithCookie} from '../server/response';

export const SESSION_NAME = 'CabinetSession';
const generateSession = () => crypto.randomBytes(10).toString('hex');

export const signInApi = async ({
  ctx,
  username,
  password,
}: {
  ctx: Context;
  username: unknown;
  password: unknown;
}) => {
  if (ctx.authentication) {
    if (typeof username != 'string' || typeof password != 'string') {
      return new Status(400);
    }

    const user = ctx.authentication.users.find(u => u.username === username);
    if (!user || !await bcrypt.compare(password, user.password)) {
      return new Status(401, 'Unknown username or password');
    }

    const sessionId = generateSession();
    ctx.authentication.sessions.set(sessionId, user);
    return new WithCookie({name: SESSION_NAME, value: sessionId}, OK);
  }

  return OK;
};

export const authenticateRequest = ({
  ctx,
  sessionId,
}: {
  ctx: Context,
  sessionId: unknown;
}) => {
  // No authentication required.
  if (!ctx.authentication) {
    return;
  }

  // Get user from session.
  if (typeof sessionId != 'string') {
    return new Status(400);
  }
  const user = ctx.authentication.sessions.get(sessionId);
  if (user) {
    ctx.user = user;
    return;
  }

  // Reject session.
  return new WithCookie({
    name: SESSION_NAME,
    value: '',
    expires: new Date(2000, 0, 1),
  }, new Status(401));
};
