import assertExists from "@xtjs/lib/js/assertExists";
import classNames from "@xtjs/lib/js/classNames";
import nativeOrdering from "@xtjs/lib/js/nativeOrdering";
import mapDefined from "@xtjs/lib/js/mapDefined";
import { DateTime, Duration } from "luxon";
import React, { Fragment, MutableRefObject, useEffect, useState } from "react";
import { ListedAudio, ListedPhoto, ListedVideo } from "../../api/listFiles";
import { formatDur, formatSize } from "../_common/ui";
import "./index.css";
import { RippleLoader } from "../_common/Loader";

const getRatio = (pageX: number, rect: DOMRect) =>
  (pageX - rect.left) / rect.width;

const InfoDialog = ({
  file,
}: {
  file: ListedAudio | ListedPhoto | ListedVideo;
}) => {
  const fields = {
    Size: formatSize(file.size),
    Modified: DateTime.fromMillis(file.modifiedMs).toLocaleString(
      DateTime.DATETIME_MED_WITH_WEEKDAY
    ),
    ...(file.type != "photo"
      ? {
          Author: file.author,
          Album: file.album,
          Genre: file.genre,
        }
      : {
          Alpha: file.hasAlphaChannel?.toString(),
          Channels: file.channels,
          "Chroma subsampling": file.chromaSubsampling,
          "Colour space": file.colourSpace,
          DPI: file.dpi,
          Format: file.format,
          Height: file.height,
          "ICC profile": file.hasIccProfile?.toString(),
          Orientation: file.orientation,
          Progressive: file.isProgressive?.toString(),
          Width: file.width,
        }),
  };
  return (
    <div className="playback-info-dialog">
      <div className="playback-info-header">
        <div className="playback-info-icon">ⓘ</div>
        <div className="playback-info-path">{file.path}</div>
      </div>
      <dl className="playback-info-defs">
        {Object.entries(fields).map(([n, v]) =>
          mapDefined(v, (v) => (
            <Fragment key={n}>
              <dt>{n}</dt>
              <dd>{v}</dd>
            </Fragment>
          ))
        )}
      </dl>
    </div>
  );
};

export default ({
  currentTime,
  file,
  loading,
  mediaRef: { current: mediaElem },
  onRequestPlaybackRateChange,
  onRequestToggleMontage,
  onTogglePlaylistPanel,
  playbackRate,
  playing,
  ready,
  showMontageToggle,
  totalTime,
}: {
  currentTime: Duration;
  file: ListedAudio | ListedPhoto | ListedVideo;
  loading: boolean;
  mediaRef: MutableRefObject<HTMLVideoElement | null>;
  onRequestPlaybackRateChange: (rate: number) => void;
  onRequestToggleMontage: () => void;
  onTogglePlaylistPanel: () => void;
  playbackRate: number;
  playing: boolean;
  ready: boolean;
  showMontageToggle: boolean;
  totalTime: Duration;
}) => {
  const isPhoto = file.type == "photo";

  const [showInfoDlg, setShowInfoDlg] = useState(false);

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
  // Avoid using pointer* events, there are still lots of browser and platform inconsistencies and bugs.
  useEffect(() => {
    const listener = () => {
      setScrubbingOffset(undefined);
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
      // Don't use a debounce, as it makes scrubbing feel laggy.
      if (scrubbingOffset != undefined && mediaElem) {
        const ratio = getRatio(pageX, assertExists(scrubbingRect));
        if (mediaElem) {
          // Don't use element.totalTime as end segment might not have loaded yet.
          mediaElem.currentTime = totalTime.as("seconds") * ratio;
        }
      }
    };
    const EVENTS = ["mousemove", "touchmove"] as const;
    for (const e of EVENTS) {
      document.addEventListener(e, listener, true);
    }
    return () => {
      for (const e of EVENTS) {
        document.removeEventListener(e, listener, true);
      }
    };
  }, [scrubbingOffset, mediaElem]);

  return (
    <div className={"playback"}>
      {showInfoDlg && <InfoDialog file={file} />}
      <div
        className={classNames(
          "playback-slider",
          (isPhoto || !ready) && "playback-slider-unavailable"
        )}
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
                (currentTime.toMillis() / totalTime.toMillis()) * 100
              }%`,
            }}
          />
        </div>
      </div>

      <div className="playback-main">
        {!isPhoto && ready && !playing && (
          <button onClick={() => mediaElem?.play()}>▶</button>
        )}
        {!isPhoto && ready && playing && (
          <button onClick={() => mediaElem?.pause()}>⏸</button>
        )}
        {!isPhoto && ready && (
          <button
            onClick={() => {
              if (mediaElem) {
                mediaElem.currentTime -= 10;
              }
            }}
          >
            ↺
          </button>
        )}
        {!isPhoto && ready && (
          <button
            onClick={() => {
              if (mediaElem) {
                mediaElem.currentTime += 10;
              }
            }}
          >
            ↻
          </button>
        )}
        {!isPhoto && ready && (
          <div className="playback-timestamp">
            {formatDur(currentTime)} / {formatDur(totalTime)}
          </div>
        )}

        <div className="playback-spacer" />

        {!isPhoto && loading && <RippleLoader size={40} />}
        {/* TODO HACK This is not a button as overflow with button doesn't cause ellipsis. */}
        <button
          className="playback-title"
          onClick={() => file.type != "photo" && onTogglePlaylistPanel()}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowInfoDlg(true);
          }}
        >
          {(file as any).title || file.name}
        </button>

        <div className="playback-spacer" />

        {!isPhoto && (
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
        )}
        {!isPhoto && showMontageToggle && (
          <button onClick={onRequestToggleMontage}>🎞️</button>
        )}
        <button>👍</button>
        <button>👎</button>
      </div>
    </div>
  );
};
