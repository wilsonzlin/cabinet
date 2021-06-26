import UnreachableError from "extlib/js/UnreachableError";
import parseRangeHeader from "extlib/js/parseRangeHeader";
import { createReadStream } from "fs";
import * as http from "http";
import { pipeline } from "stream";

export class SendFile {
  constructor(readonly path: string) {}
}

export class StreamFile {
  constructor(
    readonly path: string,
    readonly size: number,
    readonly type: string,
    readonly name: string
  ) {}
}

export class ClientError {
  constructor(readonly status: number, readonly message: string) {}
}

export class Json<V> {
  constructor(readonly value: V) {}
}

export type ApiOutput = SendFile | StreamFile | Json<any>;

const streamFile = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  path: string,
  name: string,
  fileSize: number,
  type: string
): void => {
  let start: number;
  let end: number;

  const range = req.headers.range;
  if (range) {
    const parsed = parseRangeHeader(range, fileSize);
    if (!parsed) {
      return res.writeHead(400).end(`Invalid range`);
    }
    start = parsed.start;
    end = parsed.end;
  } else {
    start = 0;
    end = fileSize - 1;
  }

  const streamLength = end - start + 1;

  res.writeHead(206, {
    "Accept-Ranges": "bytes",
    "Content-Disposition": `inline; filename="${name.replace(
      /[^a-zA-Z0-9-_'., ]/g,
      "_"
    )}"`,
    "Content-Length": streamLength,
    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
    "Content-Type": type,
  });

  pipeline(createReadStream(path, { start, end }), res, (err) => {
    if (err) {
      console.warn("Response stream error:", err);
    }
  });
};

export const applyResponse = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  val: ApiOutput
) => {
  if (val instanceof SendFile) {
    pipeline(createReadStream(val.path), res, (err) => {
      if (err) {
        console.warn("Response stream error:", err);
      }
    });
  } else if (val instanceof StreamFile) {
    streamFile(req, res, val.path, val.name, val.size, val.type);
  } else if (val instanceof Json) {
    res
      .writeHead(200, {
        "Content-Type": "application/json",
      })
      .end(JSON.stringify(val.value));
  } else {
    throw new UnreachableError();
  }
};
