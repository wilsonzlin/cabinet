import classNames from "@xtjs/lib/js/classNames";
import last from "@xtjs/lib/js/last";
import React, { useState } from "react";
import "./index.css";

export default ({
  components,
  onNavigate,
  onRequestClose,
  onRequestOpenPlaylist,
  showCloseButtonInsteadOfUp,
  showComponents,
  showPlaylistToggle,
  showSearch,
  useMenu,
}: {
  components: string[];
  onNavigate: (path: string[]) => void;
  onRequestClose: () => void;
  onRequestOpenPlaylist: () => void;
  showCloseButtonInsteadOfUp: boolean;
  showComponents: boolean;
  showPlaylistToggle: boolean;
  showSearch: boolean;
  useMenu: boolean;
}) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className={classNames("path", useMenu && "path-use-menu")}>
      <button
        className="path-up"
        onClick={() => {
          if (showCloseButtonInsteadOfUp) {
            onRequestClose();
          } else {
            onNavigate(components.slice(0, -1));
          }
        }}
        onContextMenu={(e) => {
          if (showCloseButtonInsteadOfUp) {
            return;
          }
          e.preventDefault();
          setShowMenu(true);
        }}
      >
        {showCloseButtonInsteadOfUp ? "←" : "↑"}
      </button>
      {showComponents && (!useMenu || showMenu) && (
        <div
          className={classNames(
            "path-components",
            useMenu && "acrylic floating"
          )}
        >
          {components.map((c, i, a) => (
            <button
              key={i}
              onClick={
                i == a.length - 1
                  ? undefined
                  : () => onNavigate(a.slice(0, i + 1))
              }
            >
              {c}
            </button>
          ))}
        </div>
      )}
      {showSearch && (
        <div className="path-search-container">
          <input
            className="path-search"
            placeholder={
              useMenu && components.length
                ? `Search ${last(components)}`
                : undefined
            }
          />
        </div>
      )}
      <div className="path-spacer" />
      {showPlaylistToggle && (
        <button
          className="path-playlist-toggle"
          onClick={onRequestOpenPlaylist}
        >
          ☰
        </button>
      )}
    </div>
  );
};
