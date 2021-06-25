import classNames from "extlib/js/classNames";
import { Duration } from "luxon";
import React from "react";
import "./index.css";

export default ({
  mediaRef: { element },
  dark,
  extended,
  playing,
  file,
  progress,
}: {
  mediaRef: { element: HTMLMediaElement | undefined };
  dark: boolean;
  extended: boolean;
  playing: boolean;
  file: {
    path: string;
    title: string;
    author?: string;
  };
  progress?: {
    current: Duration;
    total: Duration;
  };
}) => {
  return (
    <div
      className={classNames(
        "playback",
        dark && "playback-dark",
        extended && "playback-extended"
      )}
    >
      <div className="playback-thumbnail">🎵</div>
      <div className="playback-details">
        <div className="playback-path" title={file.path}>
          {file.path}
        </div>
        <div className="playback-title">{file.title}</div>
        <div>{file.author ?? ""}</div>
      </div>
      <div className="playback-controls">
        <button
          className="playback-rewind"
          onClick={() => {
            if (element) {
              element.currentTime -= 10;
            }
          }}
        >
          ↺
        </button>
        {!playing && (
          <button className="playback-play" onClick={() => element?.play()}>
            ▶
          </button>
        )}
        {playing && (
          <button className="playback-play" onClick={() => element?.pause()}>
            ⏸
          </button>
        )}
        <button
          className="playback-forward"
          onClick={() => {
            if (element) {
              element.currentTime += 10;
            }
          }}
        >
          ↻
        </button>
      </div>
      <div className="playback-progress">
        {progress && (
          <>
            <div className="playback-progress-top">
              <div>&nbsp;</div>
            </div>
            <input
              className="playback-slider"
              type="range"
              min={0}
              max={progress.total.toMillis()}
              step={1}
              value={progress.current.toMillis()}
              onChange={(e) => {
                if (element) {
                  element.currentTime = e.currentTarget.valueAsNumber / 1000;
                }
              }}
            />
            <div className="playback-progress-bottom">
              <div>
                -{progress.total.minus(progress.current).toFormat("m:ss")}
              </div>
              <div>{progress.current.toFormat("m:ss")}</div>
            </div>
          </>
        )}
      </div>
      <div className="playback-end-table">
        <button className="playback-fullscreen">⛶</button>
        <button className="playback-volume">🔊</button>
      </div>
    </div>
  );
};
