import React, { MutableRefObject } from "react";
import { ListedAudio, ListedVideo } from "../../api/listFiles";
import { apiGetPath } from "../_common/api";
import "./index.css";

export default ({
  mediaRef,
  file,
  onEnded,
  onPlaybackChange,
  onTimeUpdate,
}: {
  mediaRef: MutableRefObject<HTMLVideoElement | null>;
  file: ListedAudio | ListedVideo;
  onEnded: () => void;
  onPlaybackChange: (playing: boolean) => void;
  onTimeUpdate: (currentTime: number) => void;
}) => {
  return (
    <div className={`media-${file.type}`}>
      <video
        // A key is needed to ensure video reloads on sources change. See https://stackoverflow.com/questions/41303012/updating-source-url-on-html5-video-with-react.
        key={file.path}
        ref={mediaRef}
        autoPlay={true}
        controls={false}
        onEnded={onEnded}
        onPlay={(event) => onPlaybackChange(!event.currentTarget.paused)}
        onPause={(event) => onPlaybackChange(!event.currentTarget.paused)}
        onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
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
    </div>
  );
};
