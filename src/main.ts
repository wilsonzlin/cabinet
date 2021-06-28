#!/usr/bin/env node

import mapDefined from "extlib/js/mapDefined";
import { promises as fs, realpathSync } from "fs";
import * as sacli from "sacli";
import { Directory, Library } from "./library/model";
import { startServer } from "./server/server";

const rp = (p: string): string => realpathSync(p);

const cli = sacli.Command.new()
  .optional("library", String)
  .optional("port", Number.parseInt)
  .optional("scratch", String)
  .optional("sslkey", String)
  .optional("sslcert", String)
  .optional("ssldh", String)
  .action(
    async ({
      library = process.cwd(),
      scratch,
      port = 0,
      ssldh,
      sslcert,
      sslkey,
    }) => {
      const server = await startServer({
        library: new Library(new Directory(rp(library), "")),
        port,
        scratch: mapDefined(scratch, rp),
        ssl:
          !sslkey || !sslcert
            ? undefined
            : {
                certificate: await fs.readFile(sslcert),
                key: await fs.readFile(sslkey),
                dhParameters: ssldh ? await fs.readFile(ssldh) : undefined,
              },
      });
      console.log(`Cabinet started on port ${(server.address() as any).port}`);
    }
  );

cli.eval(process.argv.slice(2));
