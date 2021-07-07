import last from "@xtjs/lib/js/last";
import sequenceGenerator from "@xtjs/lib/js/sequenceGenerator";
import React from "react";
import "./index.css";

const LENGTHS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233];
const SUM_FORWARDS = LENGTHS.reduce(
  (sums, l) => [...sums, last(sums) + l],
  [0]
).slice(1);
const SUM_BACKWARDS = LENGTHS.slice()
  .reverse()
  .reduce((sums, l) => [...sums, last(sums) + l], [0])
  .slice(1);
const TILES = [
  ...sequenceGenerator<number>(
    LENGTHS.reduce((sum, l) => sum + l, 0),
    (_, i) => i
  ),
];

const style = document.createElement("style");
style.textContent = TILES.map(
  (i) => `
  @keyframes loading-tile-${i} {
    0% {
      background-color: transparent;
    }
    
    ${(SUM_FORWARDS.findIndex((s) => s >= i) / LENGTHS.length) * 50}% {
      background-color: transparent;
    }
  
    50% {
      background-color: #ccc;
    }
    
    ${50 + (SUM_BACKWARDS.findIndex((s) => s >= i) / LENGTHS.length) * 50}% {
      background-color: #ccc;
    }
    
    100% {
      background-color: transparent;
    }
  }
`
).join("\n");
document.head.append(style);

export default () => (
  <div className="loading">
    {TILES.map((_, i) => (
      <div
        key={i}
        className="loading-tile"
        style={{
          animationName: `loading-tile-${i}`,
        }}
      />
    ))}
  </div>
);
