"use strict";

const cheerio = require("cheerio");
const fs = require("fs");
const mkdirp = require("mkdirp");
const path = require("path");
const readdir = require("recursive-readdir");
const request = require("request");

const VIDEOS_JSON_PATH = args.videos;
const FILES_DIR = args.files;
const METADATA_PROVIDERS_DIR = args.metadata;
const CACHE_DIR = args.cache;

mkdirp.sync(CACHE_DIR);

function processLastModifiedStat (stats) {
  return Math.floor(stats.mtime.getTime() / 1000);
}

function BadHTTPStatusException (statusCode) {
  this.statusCode = statusCode;
  this.message = "Bad HTTP response status: " + statusCode;
}

BadHTTPStatusException.prototype = Object.create(Error.prototype);

function constructMetadataProviderServices (providerId) {
  let cacheName = providerId;

  let services = Object.freeze({
    Cache: {
      read: function (key) {
        return readFile(`${CACHE_DIR}/${cacheName}/${key}`);
      },
      write: function (key, value) {
        return writeFile(`${CACHE_DIR}/${cacheName}/${key}`, value);
      },
    },
    Request: {
      BadHTTPStatusException: BadHTTPStatusException,
      get: function (url) {
        return new Promise((resolve, reject) => {
          request(url, (err, resp) => {
            if (err) {
              reject(err);
              return;
            }

            let statusCode = resp.statusCode;
            if (statusCode != 200) {
              reject(new BadHTTPStatusException(statusCode));
              return;
            }

            resolve(resp.body);
          });
        });
      },
    },
    jQuery: {
      load: cheerio.load,
    },
  });

  return services;
}

let metadataProviders = new Map();
let matchTriggersToMetadataProviders = new Map();

function loadMetadataProviders () {
  fs.readdirSync(METADATA_PROVIDERS_DIR)
    .filter(f => fs.lstatSync(METADATA_PROVIDERS_DIR + "/" + f).isFile() && /^.+\.js$/.test(f))
    .forEach(f => {
      let provider = require(METADATA_PROVIDERS_DIR + "/" + f);
      if (!provider || typeof provider != "object" || typeof provider.id != "string" || typeof provider.register !=
          "function" || typeof provider.getTitle != "function") {
        throw new Error("Invalid metadata provider");
      }

      let id = provider.id;

      if (metadataProviders.has(id)) {
        throw new ReferenceError(`A metadata provider with ID "${id}" has already been registered`);
      }

      provider.triggers.matches.forEach(regexp => {
        matchTriggersToMetadataProviders.set(regexp, provider);
      });

      provider.register(constructMetadataProviderServices(id));

      metadataProviders.set(id, provider);
    });
}

loadMetadataProviders();

/*
 * Structure of each object in videos.json array:
 *
 * {
 *     id: 54,
 *     title: "Title",
 *     path: "relative/path/to/video.mp4",
 *     lastModified: 1485639176,
 *     missing: false,
 * }
 *
 */
async function loadDatabase () {
  let videos;
  try {
    videos = JSON.parse(await readFile(VIDEOS_JSON_PATH));
  } catch (e) {
    if (e.code !== "ENOENT") {
      throw e;
    }
    videos = [];
  }
  return videos;
}

/*
 * Leave deleted files as they are to preserve IDs,
 * so a path always maps to a specific ID at all times,
 * and user data won't have invalid ID references,
 * but mark them to prevent the app from listing them.
 *
 * If a path becomes valid again (either restored or replaced),
 * they should be made visible again. Old user data may be outdated.
 */
async function updateExistingDatabaseEntriesMutator (videos) {
  for (let video of videos) {
    let stats;

    try {
      stats = await lstatFile(FILES_DIR + "/" + video.path);
    } catch (e) {
      if (e.code !== "ENOENT") {
        throw e;
      }
      video.missing = true;
      continue;
    }

    if (!stats.isFile()) {
      video.missing = true;
    } else {
      video.missing = false;
      video.lastModified = processLastModifiedStat(stats);
    }
  }
}

function listVideoFiles () {
  return new Promise((resolve, reject) => {
    readdir(FILES_DIR, (err, files) => {
      if (err) {
        reject(err);
        return;
      }

      Promise.all(files.map(p => lstatFile(p)))
        .then(statsForFiles => {
          let list = files
            .map((path, fileIdx) => {
              let stats = statsForFiles[fileIdx];
              if (!stats.isFile()) {
                return null;
              }
              return {
                path: path,
                mtime: stats.mtime,
              };
            })
            .filter(file => !!file && /.+\.mp4$/i.test(file.path));

          resolve(list);
        })
        .catch(reject);
    });
  });
}

async function syncDatabaseWithFilesListMutator (videos, filesList) {
  let videoPaths = new Set(videos.map(video => video.path));

  for (let file of filesList) {
    let relativePath = path.relative(FILES_DIR, file.path);

    if (!videoPaths.has(relativePath)) {
      let fileName = path.basename(file.path);
      let id = videos.length;
      let title = null;

      for (let [regexp, provider] of matchTriggersToMetadataProviders) {
        if (regexp.test(fileName)) {
          title = await provider.getTitle({name: fileName});
          if (title != null) {
            break;
          }
        }
      }

      if (title == null) {
        title = fileName;
      }

      videos.push({
        id: id,
        title: title,
        path: relativePath,
        lastModified: processLastModifiedStat(file),
        missing: false,
      });

      console.log(`Added ${title} (${relativePath})`);
    }
  }
}

let videos;
loadDatabase()
  .then(db => {
    videos = db;
    return updateExistingDatabaseEntriesMutator(db);
  })
  .then(() => {
    return listVideoFiles();
  })
  .then(filesList => {
    return syncDatabaseWithFilesListMutator(videos, filesList);
  })
  .then(() => {
    console.info("Database synchronised");
    return writeFile(VIDEOS_JSON_PATH, JSON.stringify(videos));
  })
  .then(() => {
    console.info("Database saved");
  })
  .catch(err => {
    console.error(err);
  });
