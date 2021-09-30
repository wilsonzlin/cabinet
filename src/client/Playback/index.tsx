import assertExists from "@xtjs/lib/js/assertExists";
import classNames from "@xtjs/lib/js/classNames";
import nativeOrdering from "@xtjs/lib/js/nativeOrdering";
import mapDefined from "@xtjs/lib/js/mapDefined";
import { DateTime, Duration } from "luxon";
import React, { MutableRefObject, useEffect, useRef, useState } from "react";
import { ListedAudio, ListedPhoto, ListedVideo } from "../../api/listFiles";
import {
  fileThumbnailCss,
  formatDur,
  formatSize,
  useElemDimensions,
} from "../_common/ui";
import "./index.css";

const getRatio = (pageX: number, rect: DOMRect) =>
  (pageX - rect.left) / rect.width;

export default ({
  canShowCard,
  currentTime,
  file,
  mediaRef: { current: mediaElem },
  onDetailsButtonVisibilityChange,
  onRequestPlaybackRateChange,
  onTogglePlaylistPanel,
  playbackRate,
  playing,
  reserveRightSpace,
  totalTime,
}: {
  canShowCard: boolean;
  currentTime: Duration;
  file: ListedAudio | ListedPhoto | ListedVideo;
  mediaRef: MutableRefObject<HTMLVideoElement | null>;
  onDetailsButtonVisibilityChange: (isDetailsButtonShowing: boolean) => void;
  onRequestPlaybackRateChange: (rate: number) => void;
  onTogglePlaylistPanel: () => void;
  playbackRate: number;
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
  // Avoid using pointer* events, there are still lots of browser and platform inconsistencies and bugs.
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
      if (scrubbingOffset != undefined && mediaElem) {
        const ratio = getRatio(pageX, assertExists(scrubbingRect));
        setScrubbingOverride(ratio * 100);
        clearTimeout(scrubbingDebounce.current);
        scrubbingDebounce.current = setTimeout(() => {
          if (mediaElem) {
            // Don't use element.totalTime as end segment might not have loaded yet.
            mediaElem.currentTime = totalTime.as("seconds") * ratio;
          }
        }, 33);
      }
    };
    const EVENTS = ["mousemove", "touchmove"] as const;
    for (const e of EVENTS) {
      document.addEventListener(e, listener, true);
    }
    return () => {
      clearTimeout(scrubbingDebounce.current);
      setScrubbingOverride(undefined);
      for (const e of EVENTS) {
        document.removeEventListener(e, listener, true);
      }
    };
  }, [scrubbingOffset, mediaElem]);

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
          <div className="playback-card-size">{formatSize(file.size)}</div>
          <div className="playback-card-modified">
            Modified{" "}
            {DateTime.fromMillis(file.modifiedMs).toLocaleString(
              DateTime.DATETIME_MED_WITH_WEEKDAY
            )}
          </div>
          {file.type != "photo" && (
            <>
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
            </>
          )}
        </div>
        <div className="playback-card-rating">
          <button>👍</button>
          <button>👎</button>
        </div>
      </div>
      <div className="acrylic floating playback-main">
        <div className="playback-thumbnail" style={fileThumbnailCss(file)} />
        <div className="playback-details">
          {/* TODO HACK This is not a button as overflow with button doesn't cause ellipsis. */}
          <div
            className="playback-details-text"
            onClick={() =>
              showDetailsButton
                ? file.type != "photo" && onTogglePlaylistPanel()
                : setShowCard((s) => !s)
            }
          >
            <div className="playback-path" title={file.path}>
              {file.path}
            </div>
            <div className="playback-title">
              {(file as any).title || file.name}
            </div>
            {file.type != "photo" && <div>{file.author}</div>}
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
        {file.type == "photo" ? (
          <dl className="playback-photo-metadata">
            {mapDefined(file.hasAlphaChannel, (h) => (
              <div>
                <dt>Alpha</dt>
                <dd>{h.toString()}</dd>
              </div>
            ))}
            {mapDefined(file.channels, (channels) => (
              <div>
                <dt>Channels</dt>
                <dd>{channels}</dd>
              </div>
            ))}
            <div>
              <dt>Chroma subsampling</dt>
              <dd>{file.chromaSubsampling}</dd>
            </div>
            {mapDefined(file.colourSpace, (cs) => (
              <div>
                <dt>Colour space</dt>
                <dd>{cs}</dd>
              </div>
            ))}
            {mapDefined(file.dpi, (dpi) => (
              <div>
                <dt>DPI</dt>
                <dd>{dpi}</dd>
              </div>
            ))}
            <div>
              <dt>Format</dt>
              <dd>{file.format}</dd>
            </div>
            <div>
              <dt>Height</dt>
              <dd>{file.height}</dd>
            </div>
            {mapDefined(file.hasIccProfile, (h) => (
              <div>
                <dt>ICC profile</dt>
                <dd>{h.toString()}</dd>
              </div>
            ))}
            {mapDefined(file.orientation, (o) => (
              <div>
                <dt>Orientation</dt>
                <dd>{o}</dd>
              </div>
            ))}
            {mapDefined(file.isProgressive, (h) => (
              <div>
                <dt>Progressive</dt>
                <dd>{h.toString()}</dd>
              </div>
            ))}
            <div>
              <dt>Width</dt>
              <dd>{file.width}</dd>
            </div>
          </dl>
        ) : (
          <>
            <div className="playback-controls">
              <button
                className="playback-rewind"
                onClick={() => {
                  if (mediaElem) {
                    mediaElem.currentTime -= 10;
                  }
                }}
              >
                ↺
              </button>
              {!playing && (
                <button
                  className="playback-play"
                  onClick={() => mediaElem?.play()}
                >
                  ▶
                </button>
              )}
              {playing && (
                <button
                  className="playback-play"
                  onClick={() => mediaElem?.pause()}
                >
                  ⏸
                </button>
              )}
              <button
                className="playback-forward"
                onClick={() => {
                  if (mediaElem) {
                    mediaElem.currentTime += 10;
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
                  if (mediaElem) {
                    // Don't use element.totalTime as end segment might not have loaded yet.
                    mediaElem.currentTime = totalTime.as("seconds") * ratio;
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
                <div>-{formatDur(totalTime.minus(currentTime))}</div>
                <div>{formatDur(currentTime)}</div>
              </div>
            </div>
            <div className="playback-end-table">
              <select
                className="playback-rate"
                value={playbackRate}
                onChange={(e) =>
                  onRequestPlaybackRateChange(+e.currentTarget.value)
                }
              >
                {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, playbackRate]
                  .sort(nativeOrdering)
                  .map((v, i, a) =>
                    v === a[i - 1] ? null : (
                      <option key={v} value={v}>
                        {v}x
                      </option>
                    )
                  )}
              </select>
              <button className="playback-volume">🔊</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
