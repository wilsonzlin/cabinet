import React from "react";
import "./index.css";

export default ({
  components,
  onNavigate,
}: {
  components: string[];
  onNavigate: (path: string[]) => void;
}) => {
  return (
    <div className="path">
      <div className="path-components">
        <button onClick={() => onNavigate(components.slice(0, -1))}>↑</button>
        {components.map((c, i, a) => (
          <button key={i} onClick={() => onNavigate(a.slice(0, i + 1))}>
            {c}
          </button>
        ))}
      </div>
      <div className="path-search-container">
        <input className="path-search" />
      </div>
    </div>
  );
};
