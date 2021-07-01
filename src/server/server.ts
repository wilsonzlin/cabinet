import decodeUrlEncoded from "extlib/js/decodeUrlEncoded";
import decodeUtf8 from "extlib/js/decodeUtf8";
import readBufferStream from "extlib/js/readBufferStream";
import splitString from "extlib/js/splitString";
import * as http from "http";
import * as http2 from "http2";
import { AddressInfo } from "net";
import { Readable, Writable } from "stream";
import { APIS } from "../api/_apis";
import { ApiCtx, ApiFn } from "../api/_common";
import { Library } from "../library/model";
import { applyResponse, ClientError, writeResponse } from "./response";

declare const CLIENT_HTML: string;

export type ServerReq = Readable & {
  url?: string;
  method?: string;
  headers: { [name: string]: string | string[] | undefined };
};

export type ServerRes = Writable & {
  writeHead(status: number, headers?: { [name: string]: string }): Writable;
};

export const startServer = ({
  library,
  port,
  scratch,
  ssl,
}: {
  library: Library;
  port: number;
  scratch?: string;
  ssl?: {
    key: Buffer;
    certificate: Buffer;
    dhParameters?: Buffer;
  };
}) =>
  new Promise<number>((onServerListening) => {
    const ctx: ApiCtx = {
      library,
      scratch,
    };

    const requestHandler = async (req: ServerReq, res: ServerRes) => {
      const [pathname, queryString] = splitString(req.url ?? "", "?", 2);
      const apiName = pathname.slice(1);
      const api = (APIS as any)[apiName] as ApiFn;
      if (!api) {
        return writeResponse(
          res,
          200,
          {
            "Content-Type": "text/html",
          },
          CLIENT_HTML
        );
      }
      let input;
      if (req.method == "GET") {
        input = JSON.parse(decodeUrlEncoded(queryString));
      } else {
        const payloadBytes = await readBufferStream(req);
        input = JSON.parse(decodeUtf8(payloadBytes));
      }
      let output;
      try {
        output = await api(ctx, input);
      } catch (e) {
        if (e instanceof ClientError) {
          return writeResponse(
            res,
            e.status,
            {
              "Content-Type": "text/plain",
            },
            e.message
          );
        }
        throw e;
      }
      await applyResponse(req, res, output);
    };

    // Start server
    const server = ssl
      ? http2.createSecureServer(
          {
            allowHTTP1: true,
            cert: ssl.certificate,
            dhparam: ssl.dhParameters,
            key: ssl.key,
          },
          requestHandler
        )
      : http.createServer(requestHandler);

    server.listen(port, () =>
      onServerListening((server.address() as AddressInfo).port)
    );
  });
