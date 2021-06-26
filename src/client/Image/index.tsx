import React from "react";
import { ListedPhoto } from "../../api/listFiles";
import "./index.css";

export default ({
  file,
  path,
  onClose,
  onNavigate,
}: {
  file: ListedPhoto;
  path: string[];
  onClose: () => void;
  onNavigate: (path: string[]) => void;
}) => {
  return (
    <div className="image">
      <img src={`/getFile?${JSON.stringify({ path: file.path })}`} />

      <div className="acrylic floating image-path">
        <button onClick={onClose}>←</button>
        {path.map((c, i, a) => (
          <button key={i} onClick={() => onNavigate(a.slice(0, i + 1))}>
            {c}
          </button>
        ))}
        <button>{file.name}</button>
      </div>
    </div>
  );
};
