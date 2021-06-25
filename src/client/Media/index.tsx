import classNames from "extlib/js/classNames";
import React from "react";
import { ListedAudio, ListedVideo } from "../../api/listFiles";
import "./index.css";

export default ({
  mediaRef,
  file,
  onEnded,
  onPlaybackChange,
  onTimeUpdate,
}: {
  mediaRef: { element: HTMLMediaElement | undefined };
  file: ListedAudio | ListedVideo;
  onEnded: () => void;
  onPlaybackChange: (playing: boolean) => void;
  onTimeUpdate: (currentTime: number) => void;
}) => {
  return (
    <div className={classNames("media", `media-${file.type}`)}>
      <video
        ref={($media) => (mediaRef.element = $media ?? undefined)}
        autoPlay={true}
        controls={false}
        src={`/getFile?${JSON.stringify({ path: file.path })}`}
        onEnded={onEnded}
        onPlay={(event) => onPlaybackChange(!event.currentTarget.paused)}
        onPause={(event) => onPlaybackChange(!event.currentTarget.paused)}
        onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
      />
    </div>
  );
};
