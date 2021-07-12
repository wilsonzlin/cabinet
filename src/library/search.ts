import last from "@xtjs/lib/js/last";
import splitString from "@xtjs/lib/js/splitString";
import { join, sep } from "path";
import sqlite3 from "sqlite3";

export class FsSearch {
  private constructor(readonly db: sqlite3.Database) {}

  static new = () =>
    new Promise<FsSearch>((resolve, reject) => {
      const db = new sqlite3.Database(":memory:", function (err) {
        if (err) {
          return reject(err);
        }

        console.debug("[FsSearch] Database opened");
        db.exec(
        `
          create virtual table fs using fts5
          (
            path,
            dir,
            name,
            tokenize="trigram"
          )
        `,
          (err) => {
            if (err) {
              reject(err);
            }
            console.debug("[FsSearch] Table created");
            resolve(new FsSearch(db));
          }
        );
      });
    });

  add = (relPath: string[]) =>
    new Promise<void>((resolve, reject) => {
      this.db.run(
      `
        insert into fs
        values (?, ?, ?)
      `,
        [join(...relPath), join(...relPath.slice(0, -1)), last(relPath)],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

  query = (dir: string[], query: string, subdirs: boolean = false) =>
    new Promise<string[][]>((resolve, reject) => {
      const where = [];
      const params = [];
      where.push(`name match ?`);
      params.push(query);
      if (subdirs) {
        where.push(`dir LIKE ?`);
        params.push(join(...dir, "%"));
      } else {
        where.push(`dir = ?`);
        params.push(join(...dir));
      }
      this.db.all(
        `
          select path
          from fs
          where ${where.join(" and ")}
        `,
        params,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map((r) => splitString(r.path, sep)));
          }
        }
      );
    });
}
