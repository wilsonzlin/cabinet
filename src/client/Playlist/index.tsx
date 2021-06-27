import classNames from "extlib/js/classNames";
import React from "react";
import "./index.css";
import { ListedMedia } from "../../api/listFiles";

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
        <button onClick={() => onChangePosition(-1)}>⏹</button>
        <button onClick={() => onChangePosition(position + 1)}>⏭</button>
      </div>
    </div>
  );
};
