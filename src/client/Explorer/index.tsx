import classNames from "@xtjs/lib/js/classNames";
import { Duration } from "luxon";
import React, { useEffect, useRef, useState } from "react";
import { JsonApiOutput } from "../../api/_common";
import {
  ListedFolder,
  ListedMedia,
  ListedPhoto,
  listFilesApi,
} from "../../api/listFiles";
import { apiGetPath } from "../_common/api";
import { fileThumbnailCss } from "../_common/ui";
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

  const [visible, setVisible] = useState(false);
  const visibleDelay = useRef<any>(undefined);
  // Lazy load images as they appear, as some folders can have lots of files.
  const observer = useRef(
    new IntersectionObserver((entries) => {
      for (const e of entries) {
        clearTimeout(visibleDelay.current);
        if (e.isIntersecting) {
          // We want to show the image, even if user is just scrolling/browsing.
          // We should only not load if the user is scrolling rapidly to a specific position, as if it's really deep,
          // a lot of images will be loaded unnecessarily.
          visibleDelay.current = setTimeout(() => {
            setTimeout(() => {
              // Add some jitter so requests don't go all at once, which slows down both browser and server.
              setVisible(true);
            }, Math.random() * 300);
          }, 50);
        }
      }
    })
  );

  const [buttonElem, setButtonElem] = useState<HTMLButtonElement | undefined>(
    undefined
  );
  useEffect(() => {
    if (buttonElem) {
      observer.current.observe(buttonElem);
      return () => observer.current.unobserve(buttonElem);
    }
    return;
  }, [buttonElem]);

  return (
    <button
      ref={(elem) => setButtonElem(elem ?? undefined)}
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
          {Duration.fromMillis(file.duration * 1000).toFormat("m:ss")}
        </div>
      )}
      <div className="acrylic acrylic-grey explorer-file-name">{file.name}</div>
    </button>
  );
};

export default ({
  onClickFolder,
  onClickMediaFile,
  onClickPhotoFile,
  path,
  reserveRightSpace,
}: {
  onClickFolder: (name: string) => void;
  onClickMediaFile: (relatedFiles: ListedMedia[], file: ListedMedia) => void;
  onClickPhotoFile: (file: ListedPhoto) => void;
  path: string[];
  reserveRightSpace: boolean;
}) => {
  const [entries, setEntries] = useState<
    JsonApiOutput<typeof listFilesApi> | undefined
  >();
  useEffect(() => {
    setEntries(undefined);
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
      (r): r is ListedMedia | ListedPhoto => r.type != "dir"
    ) ?? [];

  return (
    <div
      className={classNames(
        "explorer",
        reserveRightSpace && "explorer-reserve-right-space"
      )}
    >
      {!entries && <Loading />}
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
            <File
              key={f.path}
              file={f}
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
            />
          ))}
        </div>
      </div>
    </div>
  );
};
