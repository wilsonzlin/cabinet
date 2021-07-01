import parseRangeHeader from "extlib/js/parseRangeHeader";
import { createReadStream } from "fs";
import * as http from "http";
import { PassThrough, pipeline, Readable } from "stream";

export class StreamFile {
  constructor(
    readonly path: string,
    readonly size: number,
    readonly mime?: string,
    readonly name?: string
  ) {}
}

export class ClientError {
  constructor(readonly status: number, readonly message: string) {}
}

export class Json<V> {
  constructor(readonly value: V) {}
}

export type ApiOutput = StreamFile | Json<any>;

export const writeResponse = (
  res: http.ServerResponse,
  status: number,
  headers: { [name: string]: string | number },
  data: string | Uint8Array | Readable
) => {
  const actualHeaders = Object.fromEntries(
    Object.entries(headers).map(([n, v]) => [n.toLowerCase(), v.toString()])
  );
  let src;
  if (typeof data == "string" || data instanceof Uint8Array) {
    const bytes = typeof data == "string" ? Buffer.from(data, "utf8") : data;
    if (actualHeaders["content-length"] == undefined) {
      actualHeaders["content-length"] = bytes.byteLength.toString();
    }
    src = new PassThrough();
    src.write(data);
    src.end();
  } else {
    src = data;
  }
  res.writeHead(status, actualHeaders);
  pipeline(src, res, (err) => {
    if (err && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
      console.warn("Response stream error:", err);
    }
  });
};

const streamFile = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  {
    name,
    mime,
    path,
    size,
  }: {
    path: string;
    size: number;
    name?: string;
    mime?: string;
  }
): void => {
  let start: number;
  let end: number;

  const range = req.headers.range;
  if (range) {
    const parsed = parseRangeHeader(range, size);
    if (!parsed) {
      return res.writeHead(400).end(`Invalid range`);
    }
    start = parsed.start;
    end = parsed.end;
  } else {
    start = 0;
    end = size - 1;
  }

  const streamLength = end - start + 1;

  const headers: { [name: string]: string } = {
    "Accept-Ranges": "bytes",
    "Content-Length": streamLength.toString(),
  };
  if (range) {
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  if (name != undefined) {
    headers["Content-Disposition"] = `inline; filename="${name.replace(
      /[^a-zA-Z0-9-_'., ]/g,
      "_"
    )}"`;
  }
  if (mime != undefined) {
    headers["Content-Type"] = mime;
  }

  writeResponse(
    res,
    range ? 206 : 200,
    headers,
    createReadStream(path, { start, end })
  );
};

export const applyResponse = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  val: ApiOutput
) => {
  if (val instanceof StreamFile) {
    streamFile(req, res, val);
  } else {
    writeResponse(
      res,
      200,
      {
        "Content-Type": "application/json",
      },
      JSON.stringify(val.value)
    );
  }
};
