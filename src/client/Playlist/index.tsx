import classNames from "extlib/js/classNames";
import React from "react";
import "./index.css";
import { ListedMedia } from "../../api/listFiles";

export default ({
  onChangePosition,
  onRequestClose,
  closed,
  files,
  position,
  maximised,
}: {
  onChangePosition: (pos: number) => void;
  onRequestClose: () => void;
  closed: boolean;
  files: ListedMedia[];
  position: number;
  maximised: boolean;
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
        <button className="playlist-close" onClick={onRequestClose}>
          ━
        </button>
      </div>
      <div className="playlist-controls">
        <button onClick={() => onChangePosition(position - 1)}>⏮</button>
        <button onClick={() => onChangePosition(-1)}>⏹</button>
        <button onClick={() => onChangePosition(position + 1)}>⏭</button>
      </div>
    </div>
  );
};
