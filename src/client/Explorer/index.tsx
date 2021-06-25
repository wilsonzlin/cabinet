import classNames from "extlib/js/classNames";
import React, { useEffect, useState } from "react";
import { JsonApiOutput } from "../../api/_common";
import {
  ListedAudio,
  ListedFolder,
  ListedMedia,
  ListedPhoto,
  ListedVideo,
  listFilesApi,
} from "../../api/listFiles";
import "./index.css";

export default ({
  extended,
  path,
  onClickFolder,
  onClickMediaFile,
  onClickPhotoFile,
}: {
  extended: boolean;
  path: string[];
  onClickFolder: (name: string) => void;
  onClickMediaFile: (relatedFiles: ListedMedia[], file: ListedMedia) => void;
  onClickPhotoFile: (file: ListedPhoto) => void;
}) => {
  const [entries, setEntries] = useState<
    JsonApiOutput<typeof listFilesApi> | undefined
  >();
  useEffect(() => {
    fetch("/listFiles", {
      method: "POST",
      body: JSON.stringify({
        path,
      }),
    })
      .then((res) => res.json())
      .then(setEntries);
  }, [path]);

  const folders =
    entries?.results.filter((r): r is ListedFolder => r.type == "dir") ?? [];

  const files =
    entries?.results.filter(
      (r): r is ListedAudio | ListedPhoto | ListedVideo => r.type != "dir"
    ) ?? [];

  return (
    <div className={classNames("explorer", extended && "explorer-extended")}>
      <div className="explorer-entries">
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
            <button
              key={f.path}
              className="explorer-file"
              onClick={() => {
                if (f.type == "photo") {
                  onClickPhotoFile(f);
                } else {
                  onClickMediaFile(
                    files.filter((o): o is ListedMedia => o.type == f.type),
                    f
                  );
                }
              }}
            >
              <div className="explorer-file-thumbnail" />
              <div className="explorer-file-name">{f.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
