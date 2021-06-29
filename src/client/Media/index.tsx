import assertState from "extlib/js/assertState";
import classNames from "extlib/js/classNames";
import filterValue from "extlib/js/filterValue";
import mapDefined from "extlib/js/mapDefined";
import React, { MutableRefObject, useEffect, useRef, useState } from "react";
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

  const onSeekOrTimeUpdate = useRef<((ts: number) => void) | undefined>(
    undefined
  );

  const [videoSrc, setVideoSrc] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (file.type == "audio") {
      setVideoSrc(apiGetPath("getFile", { path: file.path }));
      return;
    }
    fetch(apiGetPath("getFile", { path: file.path, contentManifest: true }))
      .then((r) => r.json())
      .then(
        ({
          type,
          audio,
          video: segments,
        }: {
          type: string;
          audio: boolean;
          video: number[];
        }) => {
          if (type == "src") {
            setVideoSrc(apiGetPath("getFile", { path: file.path }));
            return;
          }
          assertState(type === "segments");

          const src = new MediaSource();
          let srcBuf: SourceBuffer | undefined;
          // TODO URL.revokeObjectURL?
          setVideoSrc(URL.createObjectURL(src));
          src.addEventListener("sourceopen", () => {
            src.setLiveSeekableRange(0, file.duration);
            srcBuf = src.addSourceBuffer('video/mp4; codecs="avc1.64001F"');
            srcBuf.mode = "segments";
            ensureTimeRangeFetched(0, 60);

            if (!audio) {
              return;
            }
            const audioSrcBuf = src.addSourceBuffer("audio/aac");
            // TODO await audioSrcBuf.on('updateend').
            fetch(apiGetPath("getFile", { path: file.path, audioTrack: true }))
              .then((r) => r.arrayBuffer())
              .then((b) => audioSrcBuf.appendBuffer(b));
          });

          const segmentFetchQueue: number[] = [];
          const segmentFetchStarted = new Set<number>();
          let segmentFetchInProgress = false;
          const processSegmentFetchQueue: () => void = async () => {
            if (segmentFetchInProgress || !srcBuf) {
              return;
            }
            segmentFetchInProgress = true;
            for (
              let segment;
              (segment = segmentFetchQueue.shift()) !== undefined;

            ) {
              if (segmentFetchStarted.has(segment)) {
                continue;
              }
              segmentFetchStarted.add(segment);
              srcBuf.timestampOffset = segments[segment];
              const segmentUrl = apiGetPath("getFile", {
                path: file.path,
                segment,
              });
              srcBuf.appendBuffer(
                await fetch(segmentUrl).then((r) => r.arrayBuffer())
              );
              await new Promise((resolve) =>
                srcBuf!.addEventListener("updateend", resolve, { once: true })
              );
              if (segment == segments.length - 1) {
                src.endOfStream();
              }
            }
            segmentFetchInProgress = false;
          };
          const ensureTimeRangeFetched = (fromTs: number, toTs: number) => {
            const lastSegment = segments.length - 1;
            const startSegment =
              filterValue(
                segments.findIndex((_, i, a) => a[i + 1] > fromTs),
                (i) => i >= 0
              ) ?? lastSegment;
            const endSegment =
              filterValue(
                segments.findIndex((ts) => ts > toTs),
                (i) => i >= 0
              ) ?? lastSegment;
            for (let segment = startSegment; segment <= endSegment; segment++) {
              segmentFetchQueue.push(segment);
            }
            processSegmentFetchQueue();
          };
          onSeekOrTimeUpdate.current = (ts) =>
            ensureTimeRangeFetched(ts, ts + 60);
        }
      );
    return () => {
      setVideoSrc(undefined);
      onSeekOrTimeUpdate.current = undefined;
    };
  }, [file]);

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
        onSeeking={(event) =>
          onSeekOrTimeUpdate.current?.(event.currentTarget.currentTime)
        }
        onTimeUpdate={(event) => {
          const time = event.currentTarget.currentTime;
          setCurrentTime(time);
          onTimeUpdate(time);
          onSeekOrTimeUpdate.current?.(time);
        }}
        src={videoSrc}
      />
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
