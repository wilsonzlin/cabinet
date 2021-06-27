import last from "extlib/js/last";
import classNames from "extlib/js/classNames";
import React, { useState } from "react";
import "./index.css";

export default ({
  components,
  onNavigate,
  useMenu,
}: {
  components: string[];
  onNavigate: (path: string[]) => void;
  useMenu: boolean;
}) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className={classNames("path", useMenu && "path-use-menu")}>
      <div className="path-components">
        <button
          onClick={() => onNavigate(components.slice(0, -1))}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowMenu(true);
          }}
        >
          ↑
        </button>
        {(!useMenu || showMenu) && (
          <div
            className={classNames(
              "path-components-list",
              useMenu && "acrylic floating"
            )}
          >
            {components.map((c, i, a) => (
              <button key={i} onClick={() => onNavigate(a.slice(0, i + 1))}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
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
    </div>
  );
};
