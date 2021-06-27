import assertExists from "extlib/js/assertExists";
import classNames from "extlib/js/classNames";
import mapDefined from "extlib/js/mapDefined";
import { Duration } from "luxon";
import React, { MutableRefObject, useEffect, useRef, useState } from "react";
import { ListedAudio, ListedVideo } from "../../api/listFiles";
import { useElemDimensions } from "../_common/ui";
import "./index.css";

const getRatio = (pageX: number, rect: DOMRect) =>
  (pageX - rect.left) / rect.width;

export default ({
  canShowCard,
  currentTime,
  file,
  mediaRef: { current: element },
  onDetailsButtonVisibilityChange,
  onTogglePlaylistPanel,
  playing,
  reserveRightSpace,
  totalTime,
}: {
  canShowCard: boolean;
  currentTime: Duration;
  file: ListedAudio | ListedVideo;
  mediaRef: MutableRefObject<HTMLVideoElement | null>;
  onDetailsButtonVisibilityChange: (isDetailsButtonShowing: boolean) => void;
  onTogglePlaylistPanel: () => void;
  playing: boolean;
  reserveRightSpace: boolean;
  totalTime: Duration;
}) => {
  const [showCard, setShowCard] = useState(false);
  useEffect(() => {
    setShowCard(false);
  }, [canShowCard]);

  const [elem, setElem] = useState<HTMLDivElement | undefined>(undefined);
  const { width } = useElemDimensions(elem);
  const showDetailsButton = width <= 690;
  useEffect(() => {
    onDetailsButtonVisibilityChange(showDetailsButton);
  }, [showDetailsButton]);

  // We don't use a simple input[type=range] for several reasons:
  // - Difficulty in cross-browser/-platform styling.
  // - Bad onTimeUpdate => value => onChange loop.
  // - Not actually that smooth on all devices.
  const [scrubbingOffset, setScrubbingOffset] = useState<number | undefined>(
    undefined
  );
  const [scrubbingRect, setScrubbingRect] = useState<DOMRect | undefined>(
    undefined
  );
  const scrubbingDebounce = useRef<any>();
  // Use a fake fill percentage when scrubbing to have perceived smooth scrubbing while still using a debounce.
  const [scrubbingOverride, setScrubbingOverride] = useState<
    number | undefined
  >(undefined);
  // Avoid using pointer* events, there are still lots of browser and platform
  // inconsistencies and bugs.
  useEffect(() => {
    const listener = () => {
      setScrubbingOffset(undefined);
      setScrubbingOverride(undefined);
    };
    const EVENTS = ["mouseup", "touchend", "touchcancel"];
    for (const e of EVENTS) {
      document.addEventListener(e, listener, true);
    }
    return () => {
      for (const e of EVENTS) {
        document.removeEventListener(e, listener, true);
      }
    };
  }, []);
  useEffect(() => {
    const listener = (e: MouseEvent | TouchEvent) => {
      const pageX = "touches" in e ? e.touches[0].pageX : e.pageX;
      if (scrubbingOffset != undefined && element) {
        const ratio = getRatio(pageX, assertExists(scrubbingRect));
        setScrubbingOverride(ratio * 100);
        clearTimeout(scrubbingDebounce.current);
        scrubbingDebounce.current = setTimeout(() => {
          if (element) {
            element.currentTime = element.duration * ratio;
          }
        }, 100);
      }
    };
    const EVENTS = ["mousemove", "touchmove"] as const;
    for (const e of EVENTS) document.addEventListener(e, listener, true);
    return () => {
      clearTimeout(scrubbingDebounce.current);
      for (const e of EVENTS) document.removeEventListener(e, listener, true);
    };
  }, [scrubbingOffset, element]);

  return (
    <div
      ref={(e) => setElem(e ?? undefined)}
      className={classNames(
        "playback",
        reserveRightSpace && "playback-reserve-right-space",
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
          {/* TODO HACK This is not a button as overflow doesn't cause ellipsis. */}
          <div
            className="playback-details-text"
            onClick={() =>
              showDetailsButton
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
          {showDetailsButton && (
            <button
              className="playback-details-button"
              onClick={() => setShowCard((s) => !s)}
            >
              ⓘ
            </button>
          )}
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
          <div className="playback-progress-top">
            <div>&nbsp;</div>
          </div>
          <div
            className="playback-slider"
            onPointerDown={(e) => {
              setScrubbingOffset(e.clientX);
              const rect = e.currentTarget.getBoundingClientRect();
              setScrubbingRect(rect);
              const ratio = getRatio(e.pageX, rect);
              if (element) {
                element.currentTime = element.duration * ratio;
              }
            }}
          >
            <div className="playback-slider-tube">
              <div
                className="playback-slider-fill"
                style={{
                  width: `${
                    scrubbingOverride ??
                    (currentTime.toMillis() / totalTime.toMillis()) * 100
                  }%`,
                }}
              />
            </div>
          </div>
          <div className="playback-progress-bottom">
            <div>-{totalTime.minus(currentTime).toFormat("m:ss")}</div>
            <div>{currentTime.toFormat("m:ss")}</div>
          </div>
        </div>
        <div className="playback-end-table">
          <button className="playback-fullscreen">⛶</button>
          <button className="playback-volume">🔊</button>
        </div>
      </div>
    </div>
  );
};
