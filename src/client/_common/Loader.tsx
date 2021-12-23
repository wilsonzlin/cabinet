import React from "react";
import "./Loader.css";

export const RippleLoader = ({ size }: { size: number }) => (
  <div
    className="loader-ripple"
    style={{
      fontSize: `${size}px`,
    }}
  >
    <div></div>
    <div></div>
  </div>
);
