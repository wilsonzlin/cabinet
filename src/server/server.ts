import decodeUrlEncoded from "extlib/js/decodeUrlEncoded";
import decodeUtf8 from "extlib/js/decodeUtf8";
import readBufferStream from "extlib/js/readBufferStream";
import splitString from "extlib/js/splitString";
import * as http from "http";
import https from "https";
import { APIS } from "../api/_apis";
import { ApiCtx, ApiFn } from "../api/_common";
import { Library } from "../library/model";
import { applyResponse, ClientError } from "./response";

declare const CLIENT_HTML: string;

export const startServer = ({
  ssl,
  port,
  library,
  scratch,
}: {
  ssl?: {
    key: Buffer;
    certificate: Buffer;
    dhParameters?: Buffer;
  };
  port: number;
  library: Library;
  scratch?: string;
}) =>
  new Promise<http.Server>((onServerListening) => {
    const ctx: ApiCtx = {
      library,
      scratch,
    };

    const requestHandler = async (
      req: http.IncomingMessage,
      res: http.ServerResponse
    ) => {
      const [pathname, queryString] = splitString(req.url ?? "", "?", 2);
      const apiName = pathname.slice(1);
      const api = (APIS as any)[apiName] as ApiFn;
      if (!api) {
        return res
          .writeHead(200, {
            "Content-Type": "text/html",
          })
          .end(CLIENT_HTML);
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
          return res
            .writeHead(e.status, {
              "Content-Type": "text/plain",
            })
            .end(e.message);
        }
        throw e;
      }
      applyResponse(req, res, output);
    };

    // Start server
    const server = ssl
      ? https.createServer(
          {
            key: ssl.key,
            cert: ssl.certificate,
            dhparam: ssl.dhParameters,
          },
          requestHandler
        )
      : http.createServer(requestHandler);

    server.listen(port, () => onServerListening(server));
  });
