import React from "react";
import "./index.css";

export default ({ Path }: { Path: () => JSX.Element }) => {
  return (
    <div className="menu">
      <Path />
    </div>
  );
};
