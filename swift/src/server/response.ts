import {NextFunction, Request, Response} from 'express';
import {UnreachableError} from 'extlib/js/assert/assert';
import {createReadStream} from 'fs';

export class SendFile {
  constructor (
    readonly path: string,
  ) {
  }
}

export class StreamFile {
  constructor (
    readonly path: string,
    readonly size: number,
    readonly type: string,
    readonly name: string,
  ) {
  }
}

export class Status {
  constructor (
    readonly status: number,
    readonly message: string = '',
  ) {
  }
}

export class Json {
  constructor (
    readonly value: object | any[],
  ) {
  }
}

export type Cookie = {
  name: string;
  value: string;
  expires?: Date;
};

export class WithCookie {
  constructor (
    readonly cookie: Cookie,
    readonly res: Res,
  ) {
  }
}

export class WithHeaders {
  constructor (
    readonly headers: { [name: string]: string },
    readonly res: Res,
  ) {
  }
}

export const OK = new Status(200);
export const NOT_FOUND = new Status(404);

export type Res = SendFile | Status | StreamFile | Json | WithCookie | WithHeaders;

const streamFile = (req: Request, res: Response, path: string, name: string, fileSize: number, type: string): void => {
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
    'Accept-Ranges': 'bytes',
    'Content-Disposition': `inline; filename="${name.replace(/[^a-zA-Z0-9-_'., ]/g, '_')}"`,
    'Content-Length': streamLength,
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Content-Type': type,
  });

  const stream = createReadStream(path, {start, end, autoClose: true});
  stream.on('error', err => res.status(500).end(`Internal streaming error: ${err}`));
  stream.pipe(res);
  req.on('close', () => stream.destroy());
};

export const applyResponse = (req: Request, res: Response, val: Res) => {
  if (val instanceof SendFile) {
    res.sendFile(val.path);
  } else if (val instanceof Status) {
    res.status(val.status).end(val.message);
  } else if (val instanceof StreamFile) {
    streamFile(req, res, val.path, val.name, val.size, val.type);
  } else if (val instanceof Json) {
    res.json(val.value);
  } else if (val instanceof WithCookie) {
    res.cookie(val.cookie.name, val.cookie.value, {
      httpOnly: true,
      expires: val.cookie.expires,
    });
    applyResponse(req, res, val.res);
  } else {
    throw new UnreachableError();
  }
};

export const maybeInterceptResponse = (req: Request, res: Response, next: NextFunction, val: Res | undefined) => {
  if (val === undefined) {
    next();
  } else {
    applyResponse(req, res, val);
  }
};
