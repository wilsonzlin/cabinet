import React from "react";
import "./index.css";

export default ({
  mediaRef,
  source,
  onEnded,
  onPlaybackChange,
  onTimeUpdate,
}: {
  mediaRef: { element: HTMLMediaElement | undefined };
  source: string;
  onEnded: () => void;
  onPlaybackChange: (playing: boolean) => void;
  onTimeUpdate: (currentTime: number) => void;
}) => {
  return (
    <div className="media">
      <video
        ref={($media) => (mediaRef.element = $media ?? undefined)}
        autoPlay={true}
        controls={false}
        className="media-video"
        src={source}
        onEnded={onEnded}
        onPlay={(event) => onPlaybackChange(!event.currentTarget.paused)}
        onPause={(event) => onPlaybackChange(!event.currentTarget.paused)}
        onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
      />
    </div>
  );
};
