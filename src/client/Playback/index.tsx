import classNames from "extlib/js/classNames";
import mapDefined from "extlib/js/mapDefined";
import { Duration } from "luxon";
import React, { MutableRefObject, useEffect, useState } from "react";
import { ListedAudio, ListedVideo } from "../../api/listFiles";
import { useElemDimensions } from "../_common/ui";
import "./index.css";

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
          <input
            className="playback-slider"
            type="range"
            min={0}
            max={totalTime.toMillis()}
            step={1}
            value={currentTime.toMillis()}
            onChange={(e) => {
              if (element) {
                element.currentTime = e.currentTarget.valueAsNumber / 1000;
              }
            }}
          />
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
