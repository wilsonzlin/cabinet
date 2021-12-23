import classNames from "@xtjs/lib/js/classNames";
import last from "@xtjs/lib/js/last";
import React, { useState } from "react";
import { parseSearchFilter } from "../_common/search";
import "./index.css";

export default ({
  components,
  onChangeSearchValue,
  onNavigate,
  onRequestClose,
  searchValue,
  showCloseButtonInsteadOfUp,
  showComponents,
  showSearch,
  useMenu,
}: {
  components: string[];
  onChangeSearchValue: (val: string) => void;
  onNavigate: (path: string[]) => void;
  onRequestClose: () => void;
  searchValue: string;
  showCloseButtonInsteadOfUp: boolean;
  showComponents: boolean;
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
        <div
          className={classNames(
            "path-search-container",
            !!searchValue.trim() &&
              !parseSearchFilter(searchValue).filter &&
              "path-search-container-invalid"
          )}
        >
          <input
            className="path-search"
            onChange={(e) => onChangeSearchValue(e.currentTarget.value)}
            value={searchValue}
            onBlur={(e) =>
              onChangeSearchValue(e.currentTarget.value.trimLeft())
            }
            placeholder={
              useMenu && components.length
                ? `Search ${last(components)}`
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
};
