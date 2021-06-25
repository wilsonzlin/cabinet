import React from "react";
import { ListedAudio, ListedVideo } from "../../api/listFiles";
import "./index.css";

export default ({
  mediaRef,
  file,
  onClose,
  onEnded,
  onPlaybackChange,
  onTimeUpdate,
}: {
  mediaRef: { element: HTMLMediaElement | undefined };
  file: ListedAudio | ListedVideo;
  onClose: () => void;
  onEnded: () => void;
  onPlaybackChange: (playing: boolean) => void;
  onTimeUpdate: (currentTime: number) => void;
}) => {
  return (
    <div className={`media-${file.type}`}>
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
      <button className="media-close" onClick={onClose}>
        ←
      </button>
    </div>
  );
};
