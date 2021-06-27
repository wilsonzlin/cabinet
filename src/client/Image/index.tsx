import React from "react";
import { ListedPhoto } from "../../api/listFiles";
import "./index.css";

export default ({ file }: { file: ListedPhoto }) => {
  return (
    <div className="image">
      <img src={`/getFile?${JSON.stringify({ path: file.path })}`} />
    </div>
  );
};
