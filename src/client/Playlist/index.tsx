import classNames from "extlib/js/classNames";
import React from "react";
import "./index.css";

export default ({
  onRequestClose,
  onStop,
  closed,
  dark,
}: {
  onRequestClose: () => void;
  onStop: () => void;
  closed: boolean;
  dark: boolean;
}) => {
  return (
    <div
      className={classNames(
        "playlist",
        closed && "playlist-closed",
        dark && "playlist-dark"
      )}
    >
      <div className="playlist-menu">
        <button className="playlist-picker">Now playing</button>
        <button className="playlist-close" onClick={onRequestClose}>
          ━
        </button>
      </div>
      <div className="playlist-items" />
      <div className="playlist-controls">
        <button>⏮</button>
        <button onClick={onStop}>⏹</button>
        <button>⏭</button>
      </div>
    </div>
  );
};
