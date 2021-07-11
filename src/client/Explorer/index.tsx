import { cancellable, CancelledError } from "@xtjs/lang/js/cancellable";
import classNames from "@xtjs/lib/js/classNames";
import React, { useEffect, useState } from "react";
import { JsonApiOutput } from "../../api/_common";
import {
  ListedFolder,
  ListedMedia,
  ListedPhoto,
  listFilesApi,
} from "../../api/listFiles";
import { apiGetPath } from "../_common/api";
import { parseSearchFilter } from "../_common/search";
import { fileThumbnailCss, formatDur, useLazyLoad } from "../_common/ui";
import Loading from "../Loading";
import "./index.css";

const File = ({
  file,
  onClick,
}: {
  file: ListedMedia | ListedPhoto;
  onClick: () => void;
}) => {
  const [previewSrc, setPreviewSrc] = useState<string | undefined>(undefined);
  const { visible, setLazyElem } = useLazyLoad();

  return (
    <button
      ref={setLazyElem}
      className="shadowtext explorer-file"
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
      style={!visible ? undefined : fileThumbnailCss(file)}
    >
      {file.type == "video" && (
        <video
          src={previewSrc}
          className="explorer-file-video-preview"
          autoPlay={true}
          controls={false}
          muted={true}
        />
      )}
      {(file.type == "video" || file.type == "audio") && (
        <div className="acrylic acrylic-grey explorer-file-duration">
          {formatDur(file.duration)}
        </div>
      )}
      <div className="acrylic acrylic-grey explorer-file-name">{file.name}</div>
    </button>
  );
};

export default ({
  filter: rawFilter,
  onClickFolder,
  onClickMediaFile,
  onClickPhotoFile,
  path,
  reserveRightSpace,
}: {
  filter: string;
  onClickFolder: (name: string) => void;
  onClickMediaFile: (relatedFiles: ListedMedia[], file: ListedMedia) => void;
  onClickPhotoFile: (file: ListedPhoto) => void;
  path: string[];
  reserveRightSpace: boolean;
}) => {
  const [entries, setEntries] = useState<
    JsonApiOutput<typeof listFilesApi> | undefined
  >();
  const { filter, subdirectories } = parseSearchFilter(rawFilter);
  useEffect(() => {
    setEntries(undefined);
    const req = cancellable(function* () {
      const res = yield fetch("/listFiles", {
        method: "POST",
        body: JSON.stringify({
          path,
          filter,
          subdirectories,
        }),
      });
      setEntries(yield res.json());
    });
    req.catch((e) => {
      if (!(e instanceof CancelledError)) {
        throw e;
      }
    });
    return () => req.cancel();
  }, [path, filter, subdirectories]);

  return (
    <div
      className={classNames(
        "explorer",
        reserveRightSpace && "explorer-reserve-right-space"
      )}
    >
      {!entries ? (
        <Loading />
      ) : (
        entries.results.map(({ dir, entries }) => {
          const folders =
            entries.filter((r): r is ListedFolder => r.type == "dir") ?? [];

          const files =
            entries.filter(
              (r): r is ListedMedia | ListedPhoto => r.type != "dir"
            ) ?? [];

          return (
            <div className="explorer-entries" key={dir.join("\0")}>
              {subdirectories && <strong>{dir}</strong>}
              <div className="explorer-folders">
                {folders.map((f) => (
                  <button
                    key={f.name}
                    className="explorer-folder"
                    onClick={() => onClickFolder(f.name)}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
              <div className="explorer-files">
                {files.map((f) => (
                  <File
                    key={f.path}
                    file={f}
                    onClick={() => {
                      if (f.type == "photo") {
                        onClickPhotoFile(f);
                      } else {
                        onClickMediaFile(
                          files.filter(
                            (o): o is ListedMedia => o.type == f.type
                          ),
                          f
                        );
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
