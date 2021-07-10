import assertState from "@xtjs/lib/js/assertState";
import classNames from "@xtjs/lib/js/classNames";
import defined from "@xtjs/lib/js/defined";
import filterValue from "@xtjs/lib/js/filterValue";
import mapDefined from "@xtjs/lib/js/mapDefined";
import React, { MutableRefObject, useEffect, useRef, useState } from "react";
import { ListedMedia } from "../../api/listFiles";
import { GaplessMetadata } from "../../util/media";
import { apiGetPath } from "../_common/api";
import { formatDur, useLazyLoad } from "../_common/ui";
import "./index.css";

const SHOW_NEXT_IN_LAST_N_SECS = 10;

const MontageFrame = ({
  filePath,
  onClick,
  time,
}: {
  filePath: string;
  onClick: () => void;
  time: number;
}) => {
  const { visible, setLazyElem } = useLazyLoad();

  return (
    <button ref={setLazyElem} className="media-montage-frame" onClick={onClick}>
      {/* Use image for auto height. */}
      <img
        src={
          !visible
            ? undefined
            : apiGetPath("getFile", {
                path: filePath,
                montageFrame: time,
              })
        }
      />
      <div>{formatDur(time)}</div>
    </button>
  );
};

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

  const [montageFrames, setMontageFrames] = useState<number[]>([]);
  const [showMontageFrames, setShowMontageFrames] = useState(false);

  const [videoSrc, setVideoSrc] = useState<string | undefined>(undefined);
  useEffect(() => {
    setMontageFrames([]);
    if (file.type == "audio") {
      setVideoSrc(apiGetPath("getFile", { path: file.path }));
      return;
    }
    fetch(apiGetPath("getFile", { path: file.path, contentManifest: true }))
      .then((r) => r.json())
      .then(
        ({
          type,
          montageFrames,
          audio,
          video: segments,
        }: {
          type: string;
          montageFrames: number[];
          audio: boolean;
          video: number[];
        }) => {
          setMontageFrames(montageFrames);

          if (type == "src") {
            setVideoSrc(apiGetPath("getFile", { path: file.path }));
            return;
          }
          // See server code for how this works.
          assertState(type === "segments");

          const src = new MediaSource();
          let videoSrcBuf: SourceBuffer | undefined;
          let audioSrcBuf: SourceBuffer | undefined;
          // TODO URL.revokeObjectURL?
          setVideoSrc(URL.createObjectURL(src));
          src.addEventListener("sourceopen", () => {
            src.setLiveSeekableRange(0, file.duration);
            videoSrcBuf = src.addSourceBuffer(
              // Example values:
              // - video/webm; codecs="vp9, opus"
              // - video/mp4; codecs="avc1.64001F, mp4a.40.2"
              'video/mp4; codecs="avc1.64001F"'
            );
            videoSrcBuf.mode = "segments";

            if (audio) {
              audioSrcBuf = src.addSourceBuffer(
                'audio/mp4; codecs="mp4a.40.2"'
              );
            }

            ensureTimeRangeFetched(0, 60);
          });

          const segmentFetchQueue: number[] = [];
          const segmentFetchStarted = new Set<number>();
          let segmentFetchInProgress = false;
          const processSegmentFetchQueue: () => void = async () => {
            if (segmentFetchInProgress) {
              return;
            }
            segmentFetchInProgress = true;
            while (segmentFetchQueue.length) {
              const fetched = await Promise.all(
                segmentFetchQueue.splice(0).map(async (segment) => {
                  if (segmentFetchStarted.has(segment)) {
                    return undefined;
                  }
                  segmentFetchStarted.add(segment);

                  return await Promise.all(
                    (
                      [
                        ["audio", audioSrcBuf],
                        ["video", videoSrcBuf],
                      ] as const
                    ).map(async ([streamName, streamBuf]) => {
                      if (!streamBuf) {
                        return;
                      }
                      const segmentUrl = apiGetPath("getFile", {
                        path: file.path,
                        segment: { index: segment, stream: streamName },
                      });
                      return {
                        segment,
                        data: await fetch(segmentUrl).then((r) =>
                          r.arrayBuffer()
                        ),
                        stream: streamBuf,
                        gaplessMetadata:
                          streamName == "audio"
                            ? await fetch(
                                apiGetPath("getFile", {
                                  path: file.path,
                                  segmentGaplessMetadata: segment,
                                })
                              )
                                .then((r) => r.json())
                                .then(
                                  (o) =>
                                    o.gaplessMetadata as
                                      | GaplessMetadata
                                      | undefined
                                )
                            : undefined,
                      };
                    })
                  );
                })
              ).then((fetched) => fetched.flat().filter(defined));

              for (const {
                segment,
                data,
                stream,
                gaplessMetadata,
              } of fetched) {
                const offset = segments[segment];
                if (gaplessMetadata) {
                  // Is audio.
                  // Avoid floating point problems.
                  // If we don't do this, we'll get out of range errors like
                  // "expected (0, 6.006] but got 6.006".
                  stream.appendWindowStart = Math.max(0, offset - 0.001);
                  stream.appendWindowEnd = segments[segment + 1] ?? Infinity;
                  stream.timestampOffset = offset - gaplessMetadata.start;
                } else {
                  stream.timestampOffset = offset;
                }
                stream.appendBuffer(data);
                await new Promise((resolve) =>
                  stream.addEventListener("updateend", resolve, { once: true })
                );
                if (stream == videoSrcBuf && segment == segments.length - 1) {
                  src.endOfStream();
                }
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
            ensureTimeRangeFetched(ts, ts + 30);
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
        onClick={() => setShowMontageFrames((x) => !x)}
        onContextMenu={(e) => e.preventDefault()}
        src={videoSrc}
      />
      {showMontageFrames && (
        <div className="acrylic media-montage">
          {montageFrames.map((time) => (
            <MontageFrame
              key={[file.path, time].join("\0")}
              filePath={file.path}
              onClick={() => {
                if (mediaRef.current) {
                  mediaRef.current.currentTime = time;
                }
              }}
              time={time}
            />
          ))}
        </div>
      )}
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
