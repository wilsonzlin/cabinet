import classNames from "extlib/js/classNames";
import React from "react";
import "./index.css";

export default ({
  Path,
  tucked,
}: {
  Path: () => JSX.Element;
  tucked: boolean;
}) => {
  return (
    <div className={classNames("menu", tucked && "menu-tucked")}>
      <Path />
    </div>
  );
};
