import classNames from "extlib/js/classNames";
import React, { useEffect, useRef } from "react";
import { ListedMedia } from "../../api/listFiles";
import "./index.css";

export default ({
  closed,
  files,
  maximised,
  onChangePosition,
  onRequestClose,
  position,
  showCloseButton,
}: {
  closed: boolean;
  files: ListedMedia[];
  maximised: boolean;
  onChangePosition: (pos: number) => void;
  onRequestClose: () => void;
  position: number;
  showCloseButton: boolean;
}) => {
  const listItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    listItemRefs.current.splice(files.length);
  }, [files.length]);

  return (
    <div
      className={classNames(
        "acrylic",
        "floating",
        "playlist",
        closed && "playlist-closed",
        maximised && "playlist-maximised"
      )}
    >
      <div className="playlist-items">
        {files.map((f, i) => (
          <button
            key={i}
            ref={(elem) => (listItemRefs.current[i] = elem)}
            className="playlist-item"
            onClick={() => onChangePosition(i)}
          >
            {i == position && (
              <div className="playlist-item-current">Current</div>
            )}
            <div className="playlist-item-title">{f.title}</div>
          </button>
        ))}
      </div>
      <div className="playlist-menu">
        <button className="playlist-picker">Now playing</button>
        {showCloseButton && (
          <button className="playlist-close" onClick={onRequestClose}>
            ━
          </button>
        )}
      </div>
      <div className="playlist-controls">
        <button onClick={() => onChangePosition(position - 1)}>⏮</button>
        <button
          onClick={() =>
            listItemRefs.current[position]?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            })
          }
        >
          ◎
        </button>
        <button onClick={() => onChangePosition(position + 1)}>⏭</button>
      </div>
    </div>
  );
};
