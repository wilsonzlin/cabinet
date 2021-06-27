import classNames from "extlib/js/classNames";
import mapDefined from "extlib/js/mapDefined";
import React, { MutableRefObject, useState } from "react";
import { ListedMedia } from "../../api/listFiles";
import { apiGetPath } from "../_common/api";
import "./index.css";

const SHOW_NEXT_IN_LAST_N_SECS = 10;

export default ({
  file,
  mediaRef,
  next,
  onEnded,
  onPlaybackChange,
  onRequestNext,
  onTimeUpdate,
}: {
  file: ListedMedia;
  mediaRef: MutableRefObject<HTMLVideoElement | null>;
  next?: ListedMedia;
  onEnded: () => void;
  onPlaybackChange: (playing: boolean) => void;
  onRequestNext: () => void;
  onTimeUpdate: (currentTime: number) => void;
}) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const timeUntilNext = totalTime - currentTime;
  const nextCountdownDur = Math.min(totalTime, SHOW_NEXT_IN_LAST_N_SECS);
  const canShowNext = timeUntilNext > 0 && timeUntilNext <= nextCountdownDur;

  return (
    <div className={`media-${file.type}`}>
      <video
        // A key is needed to ensure video reloads on sources change. See https://stackoverflow.com/questions/41303012/updating-source-url-on-html5-video-with-react.
        key={file.path}
        ref={mediaRef}
        autoPlay={true}
        controls={false}
        onEnded={onEnded}
        onDurationChange={(e) => setTotalTime(e.currentTarget.duration)}
        onPlay={(event) => onPlaybackChange(!event.currentTarget.paused)}
        onPause={(event) => onPlaybackChange(!event.currentTarget.paused)}
        onTimeUpdate={(event) => {
          const time = event.currentTarget.currentTime;
          setCurrentTime(time);
          onTimeUpdate(time);
        }}
      >
        <source
          type={file.format}
          src={apiGetPath("getFile", { path: file.path })}
        />
        {file.convertedFormats.map((mime) => (
          <source
            key={`${file.path}:${mime}`}
            type={mime}
            src={apiGetPath("getFile", { path: file.path, converted: mime })}
          />
        ))}
      </video>
      {mapDefined(next, (next) => (
        <button
          // Have this always rendered to allow opacity transition in.
          className={classNames(
            "acrylic",
            "media-next",
            canShowNext && "media-next-visible"
          )}
          onClick={onRequestNext}
        >
          {canShowNext && (
            <>
              <div
                className="media-next-fill"
                style={{
                  width: `${
                    ((nextCountdownDur - timeUntilNext) / nextCountdownDur) *
                    100
                  }%`,
                }}
              />
              <div className="media-next-title">{next.title}</div>
              <div className="media-next-author">{next.author}</div>
            </>
          )}
        </button>
      ))}
    </div>
  );
};
