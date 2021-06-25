import React, { Fragment } from "react";
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
          <Fragment key={i}>
            <button onClick={() => onNavigate(a.slice(0, i + 1))}>{c}</button>
          </Fragment>
        ))}
      </div>
      <div className="path-search-container">
        <input className="path-search" />
      </div>
    </div>
  );
};
