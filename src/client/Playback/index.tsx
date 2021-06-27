import classNames from "extlib/js/classNames";
import mapDefined from "extlib/js/mapDefined";
import { Duration } from "luxon";
import React, { useEffect, useRef, useState } from "react";
import { ListedAudio, ListedVideo } from "../../api/listFiles";
import { useElemDimensions } from "../_common/ui";
import "./index.css";

export default ({
  reserveRightSpace,
  tucked,
  file,
  hideAutomatically,
  mediaRef: { element },
  onTogglePlaylistPanel,
  playing,
  progress,
}: {
  reserveRightSpace: boolean;
  tucked: boolean;
  file: ListedAudio | ListedVideo;
  hideAutomatically: boolean;
  mediaRef: { element: HTMLMediaElement | undefined };
  onTogglePlaylistPanel?: () => void;
  playing: boolean;
  progress?: {
    current: Duration;
    total: Duration;
  };
}) => {
  const [showCard, setShowCard] = useState(false);
  const [hidden, setHidden] = useState(false);
  const hideTimeout = useRef<any | undefined>(undefined);

  useEffect(() => {
    setHidden(false);
    if (!hideAutomatically) {
      return;
    }
    const EVENTS = ["click", "mousemove"];
    const listener = () => {
      setHidden(false);
      clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => {
        setHidden(true);
        setShowCard(false);
      }, 1500);
    };
    listener();
    for (const e of EVENTS) {
      document.addEventListener(e, listener, true);
    }
    return () => {
      for (const e of EVENTS) {
        document.removeEventListener(e, listener, true);
      }
      clearTimeout(hideTimeout.current);
    };
  }, [hideAutomatically]);

  const [elem, setElem] = useState<HTMLDivElement | undefined>(undefined);
  const { width } = useElemDimensions(elem);

  return (
    <div
      ref={(e) => setElem(e ?? undefined)}
      className={classNames(
        "playback",
        reserveRightSpace && "playback-reserve-right-space",
        tucked && "playback-tucked",
        hidden && "playback-hidden",
        ...[480, 560, 690, 780, 940].map((bp) =>
          width <= bp ? `playback-${bp}` : undefined
        )
      )}
    >
      <div
        className={classNames(
          "acrylic",
          "floating",
          "playback-card",
          showCard && "playback-card-open"
        )}
      >
        <div className="playback-card-details">
          <div className="playback-card-path">{file.path}</div>
          <div className="playback-card-title">{file.title}</div>
          {mapDefined(file.author, (author) => (
            <div className="playback-card-iconed">
              <span>👤</span>
              <span>{author}</span>
            </div>
          ))}
          {mapDefined(file.album, (album) => (
            <div className="playback-card-iconed">
              <span>💿</span>
              <span>{album}</span>
            </div>
          ))}
          {mapDefined(file.genre, (genre) => (
            <div className="playback-card-iconed">
              <span>𝄞</span>
              <span>{genre}</span>
            </div>
          ))}
        </div>
        <div className="playback-card-rating">
          <button>👍</button>
          <button>👎</button>
        </div>
      </div>
      <div className="acrylic floating playback-main">
        <div className="playback-thumbnail">
          {file.type == "audio" ? "🎵" : "📼"}
        </div>
        <div className="playback-details">
          <div
            className="playback-details-text"
            onClick={() =>
              onTogglePlaylistPanel
                ? onTogglePlaylistPanel()
                : setShowCard((s) => !s)
            }
          >
            <div className="playback-path" title={file.path}>
              {file.path}
            </div>
            <div className="playback-title">{file.title}</div>
            <div>{file.author ?? ""}</div>
          </div>
          <button
            className="playback-details-button"
            onClick={() => setShowCard((s) => !s)}
          >
            ⓘ
          </button>
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
    </div>
  );
};
