import classNames from "extlib/js/classNames";
import React from "react";
import "./index.css";

export default ({
  dark,
  onRequestOpenPlaylist,
}: {
  dark: boolean;
  onRequestOpenPlaylist: () => void;
}) => {
  return (
    <button
      className={classNames("playlist-toggle", dark && "playlist-toggle-dark")}
      onClick={onRequestOpenPlaylist}
    >
      ☰
    </button>
  );
};
