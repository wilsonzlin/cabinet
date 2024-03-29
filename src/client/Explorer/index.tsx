import mapDefined from "@xtjs/lib/js/mapDefined";
import classNames from "@xtjs/lib/js/classNames";
import React, { ReactNode, useEffect, useState } from "react";
import { JsonApiOutput } from "../../api/_common";
import {
  ListedFolder,
  ListedMedia,
  ListedPhoto,
  listFilesApi,
} from "../../api/listFiles";
import { apiGetPath } from "../_common/api";
import { parseSearchFilter } from "../_common/search";
import { formatDur, formatSize } from "../_common/ui";
import Loading from "../Loading";
import "./index.css";

const DirEnt = ({
  children,
  onClick,
  onMouseEnter,
  onMouseLeave,
  corner,
  name,
}: {
  children: ReactNode | ReactNode[];
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  name: string;
  corner: string | number;
}) => {
  return (
    <button
      className="explorer-dirent"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="explorer-dirent-icon">{children}</div>
      <div className="explorer-dirent-label">
        <div className="explorer-dirent-label-name">{name}</div>
        {corner && <div className="explorer-dirent-label-corner">{corner}</div>}
      </div>
    </button>
  );
};

const Folder = ({
  path,
  name,
  itemCount,
  onClick,
  types,
}: {
  path: string[];
  name: string;
  itemCount: number;
  onClick: () => void;
  types: string[];
}) => {
  const [firstEntries, setFirstEntries] = useState<
    JsonApiOutput<typeof listFilesApi> | undefined
  >();
  useEffect(() => {
    setFirstEntries(undefined);
    const abortController = new AbortController();
    fetch("/listFiles", {
      method: "POST",
      body: JSON.stringify({
        path,
        limit: 12,
        subdirectories: false,
        types,
      }),
      signal: abortController.signal,
    })
      .then((res) => res.json())
      .then(setFirstEntries);
    return () => abortController.abort();
  }, [path.join("\0")]);

  const ents = firstEntries?.results[0]?.entries ?? [];

  return !ents.length ? null : (
    <DirEnt
      corner={`${itemCount} item${itemCount == 1 ? "" : "s"}`}
      name={name}
      onClick={onClick}
    >
      <div className="explorer-folder-collage">
        {ents.map((r) =>
          r.type == "dir" ? null : (
            <img
              key={r.path}
              className="explorer-thumbnail"
              loading="lazy"
              src={apiGetPath("getFile", {
                path: r.path,
                thumbnail: true,
              })}
              style={{
                height: ents.length > 6 ? "33.33%" : "50%",
                width: ents.length > 6 ? "25%" : "33.33%",
              }}
            />
          )
        )}
      </div>
    </DirEnt>
  );
};

const File = ({
  file,
  onClick,
}: {
  file: ListedMedia | ListedPhoto;
  onClick: () => void;
}) => {
  const [previewSrc, setPreviewSrc] = useState<string | undefined>(undefined);

  return (
    <DirEnt
      corner={
        file.type == "video" || file.type == "audio"
          ? formatDur(file.duration)
          : ""
      }
      name={file.name}
      onClick={onClick}
      onMouseEnter={() =>
        setPreviewSrc(
          apiGetPath("getFile", {
            path: file.path,
            preview: true,
          })
        )
      }
      onMouseLeave={() => setPreviewSrc(undefined)}
    >
      <img
        className="explorer-file-thumbnail explorer-thumbnail"
        loading="lazy"
        src={apiGetPath("getFile", {
          path: file.path,
          thumbnail: true,
        })}
      />
      {file.type == "video" && (
        <video
          src={previewSrc}
          className="explorer-file-video-preview"
          autoPlay={true}
          controls={false}
          muted={true}
        />
      )}
    </DirEnt>
  );
};

export default ({
  filter: rawFilter,
  onClickFolder,
  onClickMediaFile,
  onClickPhotoFile,
  onClickSearchFolder,
  path,
}: {
  filter: string;
  onClickFolder: (name: string) => void;
  onClickMediaFile: (relatedFiles: ListedMedia[], file: ListedMedia) => void;
  onClickPhotoFile: (file: ListedPhoto) => void;
  onClickSearchFolder: (path: string[]) => void;
  path: string[];
}) => {
  const [mode, setMode] = useState<"list" | "tile">("tile");
  // TODO Allow adjusting column widths.
  const [listColumnWidths, _setListColumnWidths] = useState([
    0.29, 0.1, 0.25, 0.15, 0.1, 0.1,
  ]);
  const [types, setTypes] = useState<("audio" | "photo" | "video")[]>([
    "audio",
    "photo",
    "video",
  ]);

  const { filter, subdirectories } = parseSearchFilter(rawFilter);
  const [entries, setEntries] = useState<
    JsonApiOutput<typeof listFilesApi> | undefined
  >();
  useEffect(() => {
    setEntries(undefined);
    const abortController = new AbortController();
    fetch("/listFiles", {
      method: "POST",
      body: JSON.stringify({
        filter,
        path,
        subdirectories,
        types,
      }),
      signal: abortController.signal,
    })
      .then((res) => res.json())
      .then(setEntries);
    return () => abortController.abort();
  }, [filter, path, subdirectories, types]);

  const [stats, setStats] = useState<
    | {
        size: number;
        duration: number;
        files: number;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    let totalSize = 0;
    let totalDuration = 0;
    let totalFiles = 0;
    if (entries)
      for (const d of entries.results) {
        for (const e of d.entries) {
          if (e.type == "dir") continue;
          totalFiles++;
          totalSize += e.size;
          if (e.type != "photo") totalDuration += e.duration;
        }
      }
    setStats({
      size: totalSize,
      duration: totalDuration,
      files: totalFiles,
    });
  }, [entries]);

  const handleFileClick = (
    files: (ListedPhoto | ListedMedia)[],
    file: ListedPhoto | ListedMedia
  ) => {
    if (file.type == "photo") {
      onClickPhotoFile(file);
    } else {
      onClickMediaFile(
        files.filter((o): o is ListedMedia => o.type == file.type),
        file
      );
    }
  };

  const listColumnCss = (i: number) => ({
    width: `${listColumnWidths[i] * 100}%`,
  });

  const scrollLocalStorageKey = `cabinet-explorer-${path.join("/")}-scroll`;
  const [rootElem, setRootElem] = useState<HTMLDivElement | null>(null);
  const [canScroll, setCanScroll] = useState(false);
  useEffect(() => {
    // Only set scroll once entries have loaded, as otherwise we'll scroll an empty body, and then overwrite the stored scroll. Check against and toggle `canScroll` to run this only once (and not after changing filters, switching view mode, etc.).
    if (rootElem && entries && !canScroll) {
      const scrollTop = +sessionStorage[scrollLocalStorageKey];
      console.log("Restoring previous scroll position:", scrollTop);
      console.log(
        "Current scroll position and height:",
        rootElem.scrollTop,
        rootElem.scrollHeight
      );
      // Don't set scroll immediately, as React hasn't updated the DOM yet.
      setTimeout(() => (rootElem.scrollTop = scrollTop), 500);
      setCanScroll(true);
    }
  }, [canScroll, entries, rootElem, scrollLocalStorageKey]);
  useEffect(() => {
    setCanScroll(false);
  }, [scrollLocalStorageKey]);

  return (
    <div
      className={"explorer"}
      onScroll={(e) => {
        if (canScroll) {
          sessionStorage.setItem(
            scrollLocalStorageKey,
            e.currentTarget.scrollTop.toString()
          );
        }
      }}
      ref={setRootElem}
    >
      {!entries ? (
        <Loading />
      ) : (
        <>
          <div className="explorer-toolbar">
            <div className="explorer-toolbar-modes">
              <button
                className={classNames(
                  mode == "list" && "explorer-toolbar-button-active"
                )}
                onClick={() => setMode("list")}
              >
                ☰
              </button>
              <button
                className={classNames(
                  mode == "tile" && "explorer-toolbar-button-active"
                )}
                onClick={() => setMode("tile")}
              >
                ᎒᎒᎒
              </button>
            </div>
            {mapDefined(stats, (stats) => (
              <div className="explorer-stats">
                {stats.files} files, {formatSize(stats.size)},{" "}
                {formatDur(stats.duration)}
              </div>
            ))}
            <div className="explorer-toolbar-types">
              {(
                [
                  ["audio", "🎵"],
                  ["photo", "🖼️"],
                  ["video", "🎞️"],
                ] as const
              ).map(([t, l]) => (
                <button
                  key={t}
                  className={classNames(
                    types.includes(t) && "explorer-toolbar-button-active"
                  )}
                  onClick={() =>
                    setTypes(
                      types.includes(t)
                        ? types.filter((c) => c != t)
                        : types.concat(t)
                    )
                  }
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            {entries.results.map(({ dir, entries }) => {
              const folders =
                entries.filter((r): r is ListedFolder => r.type == "dir") ?? [];

              const files =
                entries.filter(
                  (r): r is ListedMedia | ListedPhoto => r.type != "dir"
                ) ?? [];

              return (
                <div className="explorer-entries" key={dir.join("\0")}>
                  {subdirectories && (
                    <a
                      className="explorer-entries-dir"
                      onClick={(e) => {
                        e.preventDefault();
                        onClickSearchFolder(dir);
                      }}
                    >
                      <span>📁</span>
                      <strong>{dir.join("/")}</strong>
                    </a>
                  )}
                  {mode == "list" ? (
                    <div className="explorer-entries-list-container">
                      <table className="explorer-entries-list">
                        <thead>
                          <tr>
                            <th />
                            <th style={listColumnCss(0)}>Name</th>
                            <th style={listColumnCss(1)}>Size</th>
                            <th style={listColumnCss(2)}>Title</th>
                            <th style={listColumnCss(3)}>Album</th>
                            <th style={listColumnCss(4)}>Author</th>
                            <th style={listColumnCss(5)}>Genre</th>
                          </tr>
                        </thead>
                        <tbody>
                          {folders.map((f) => (
                            <tr
                              key={[...dir, f.name].join("\0")}
                              onClick={() => onClickFolder(f.name)}
                            >
                              <td>📁</td>
                              <td>{f.name}</td>
                              <td>{f.itemCount} items</td>
                              <td />
                              <td />
                              <td />
                              <td />
                            </tr>
                          ))}
                          {files.map((f) => (
                            <tr
                              key={[...dir, f.name].join("\0")}
                              onClick={() => handleFileClick(files, f)}
                            >
                              <td>
                                {f.type == "audio"
                                  ? "🎵"
                                  : f.type == "photo"
                                  ? "🖼️"
                                  : "🎞️"}
                              </td>
                              <td>{f.name}</td>
                              <td>
                                {f.type == "photo"
                                  ? `${f.width}×${f.height}`
                                  : formatDur(f.duration)}
                              </td>
                              <td>{f.type != "photo" && f.title}</td>
                              <td>{f.type != "photo" && f.album}</td>
                              <td>{f.type != "photo" && f.author}</td>
                              <td>{f.type != "photo" && f.genre}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <>
                      <div className="explorer-folders">
                        {folders.map((f) => (
                          <Folder
                            key={f.name}
                            path={[...dir, f.name]}
                            name={f.name}
                            itemCount={f.itemCount}
                            onClick={() => onClickFolder(f.name)}
                            types={types}
                          />
                        ))}
                      </div>
                      <div className="explorer-files">
                        {files.map((f) => (
                          <File
                            key={f.name}
                            file={f}
                            onClick={() => handleFileClick(files, f)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
