import assertState from "@xtjs/lib/js/assertState";
import last from "@xtjs/lib/js/last";
import splitString from "@xtjs/lib/js/splitString";
import { sep } from "path";
import sqlite3 from "sqlite3";

// We use [].join(sep) instead of path.join(...[]) as path.join can cause "./".
// We use sep instead of "/" as a platform could allow "/" in paths.

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
      assertState(relPath.length >= 1);
      this.db.run(
        `
          insert into fs
          values (?, ?, ?)
        `,
        [relPath.join(sep), relPath.slice(0, -1).join(sep), last(relPath)],
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
      params.push(`"${query.replaceAll('"', '""')}"`);
      if (subdirs) {
        if (dir.length) {
          where.push(`dir LIKE ? ESCAPE '*'`);
          // Use [...dir, ""].join(sep) instead of dir.join(sep) + sep in case sep needs to be escaped.
          // If dir.length == 0, [...dir, ""].join(sep) will result in "/" which is not what we want.
          params.push([...dir, ""].join(sep).replace(/[*%_]/g, "*$&") + "%");
        } else {
          where.push("true");
        }
      } else {
        where.push(`dir = ?`);
        params.push(dir.join(sep));
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
