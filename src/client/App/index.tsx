import classNames from "@xtjs/lib/js/classNames";
import mapDefined from "@xtjs/lib/js/mapDefined";
import { Duration } from "luxon";
import React, { useEffect, useRef, useState } from "react";
import { ListedMedia, ListedPhoto } from "../../api/listFiles";
import { isIos, useElemDimensions } from "../_common/ui";
import Explorer from "../Explorer";
import Image from "../Image";
import Media from "../Media";
import Path from "../Path";
import Playback from "../Playback";
import Playlist from "../Playlist";
import "./index.css";

const ZERO_DURATION = Duration.fromMillis(0);

export default ({}: {}) => {
  const [searchValue, setSearchValue] = useState("");
  const [path, setPath_callChangePathInstead] = useState<Array<string>>([]);
  const changePath = (newPath: string[]) => {
    setSearchValue("");
    setPath_callChangePathInstead(newPath);
  };

  const [photo, setPhoto] = useState<ListedPhoto | undefined>(undefined);

  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const [mediaPlaylist, setMediaPlaylist] = useState<ListedMedia[]>([]);
  const [mediaPlaylistPosition, setMediaPlaylistPosition] =
    useState<number>(-1);
  const [playlistClosed, setPlaylistClosed] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [mediaNetworkState, setMediaNetworkState] = useState(0);
  const [mediaReadyState, setMediaReadyState] = useState(0);
  const mediaLoading =
    mediaReadyState <= HTMLMediaElement.HAVE_CURRENT_DATA &&
    mediaNetworkState == HTMLMediaElement.NETWORK_LOADING;
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState<
    Duration | undefined
  >(undefined);
  const [playbackRate, setPlaybackRate] = useState(1);
  const media: ListedMedia | undefined = mediaPlaylist[mediaPlaylistPosition];
  const currentTime = currentPlaybackTime ?? ZERO_DURATION;
  const totalTime =
    mapDefined(media, (media) => Duration.fromMillis(media.duration * 1000)) ??
    ZERO_DURATION;

  const isPlayingVideo = media?.type == "video";
  const isPlayingMedia = media?.type == "audio" || isPlayingVideo;
  const isViewing = !!(photo || isPlayingVideo);

  const [appElem, setAppElem] = useState<HTMLDivElement | undefined>(undefined);
  const { width, height } = useElemDimensions(appElem);
  const playlistMaximised = width < 860;
  const pathUseMenu = width < 1024;
  const [showMontageFrames, setShowMontageFrames] = useState(false);

  const [pointerType, setPointerType] = useState("mouse");
  useEffect(() => {
    const listener = (ev: PointerEvent) => {
      setPointerType(ev.pointerType);
    };
    const EVENTS = ["pointerdown", "pointermove"] as const;
    for (const e of EVENTS) {
      document.addEventListener(e, listener, true);
    }
    return () => {
      for (const e of EVENTS) {
        document.removeEventListener(e, listener, true);
      }
    };
  }, []);

  const [isIdle, setIsIdle] = useState(false);
  const isIdleTimeout = useRef<any | undefined>(undefined);
  useEffect(() => {
    // mousemove/pointermove don't seem to trigger continuously for touch.
    const EVENTS = [
      "pointerdown",
      "pointermove",
      "touchmove",
      "pointerup",
    ] as const;
    const listener = () => {
      setIsIdle(false);
      clearTimeout(isIdleTimeout.current);
      isIdleTimeout.current = setTimeout(() => setIsIdle(true), 7000);
    };
    listener();
    for (const e of EVENTS) {
      document.addEventListener(e, listener, true);
    }
    return () => {
      for (const e of EVENTS) {
        document.removeEventListener(e, listener, true);
      }
      clearTimeout(isIdleTimeout.current);
    };
  }, []);
  const isCurrentlyImmersed =
    isViewing &&
    isIdle &&
    !mediaLoading &&
    (playlistClosed || !playlistMaximised);

  return (
    <div
      className={classNames(
        "app",
        isViewing && "app-dark",
        `app-pt-${pointerType}`,
        (width < 500 || height < 450) && "app-tucked",
        isCurrentlyImmersed && "app-immersed",
        // iOS Safari has poor performance with lots of GPU-accelerated styles,
        // which often cause OOM crashes and app-wide poor responsiveness.
        isIos() && "app-ios"
      )}
      ref={(elem) => setAppElem(elem ?? undefined)}
    >
      <div
        className={classNames(
          "app-content",
          !playlistClosed && "app-content-playlist-open"
        )}
      >
        <Explorer
          filter={searchValue}
          onClickFolder={(f) => changePath(path.concat(f))}
          onClickMediaFile={(files, file) => {
            setMediaPlaylist(files);
            setMediaPlaylistPosition(files.indexOf(file));
          }}
          onClickPhotoFile={(f) => setPhoto(f)}
          onClickSearchFolder={changePath}
          path={path}
        />
        {isPlayingMedia && (
          <Media
            file={media}
            mediaRef={mediaRef}
            next={mediaPlaylist[mediaPlaylistPosition + 1]}
            onEnded={() => setMediaPlaylistPosition((i) => i + 1)}
            onNetworkStateChange={setMediaNetworkState}
            onPlaybackChange={(playing) => setPlaying(playing)}
            onPlaybackRateChange={(rate) => setPlaybackRate(rate)}
            onReadyStateChange={setMediaReadyState}
            onRequestCloseMontageFrames={() => setShowMontageFrames(false)}
            onRequestNext={() => setMediaPlaylistPosition((p) => p + 1)}
            onRequestPrev={() => setMediaPlaylistPosition((p) => p - 1)}
            onTimeUpdate={(currentTime) =>
              setCurrentPlaybackTime(Duration.fromMillis(currentTime * 1000))
            }
            showMontageFrames={showMontageFrames}
          />
        )}
        {photo && <Image file={photo} />}
        <Path
          components={path}
          onChangeSearchValue={setSearchValue}
          onNavigate={changePath}
          onRequestClose={() => {
            if (photo) {
              setPhoto(undefined);
            } else {
              setMediaPlaylistPosition(-1);
            }
          }}
          searchValue={searchValue}
          showCloseButtonInsteadOfUp={isViewing}
          showComponents={!isViewing}
          showSearch={!isViewing}
          useMenu={pathUseMenu}
        />
        {(isViewing || isPlayingMedia) && (
          <Playback
            canShowCard={!isCurrentlyImmersed}
            currentTime={currentTime}
            file={media ?? photo}
            loading={mediaLoading}
            mediaRef={mediaRef}
            onRequestPlaybackRateChange={(rate) => {
              const elem = mediaRef.current;
              if (elem) {
                elem.playbackRate = rate;
              }
            }}
            onRequestToggleMontage={() => setShowMontageFrames((x) => !x)}
            onTogglePlaylistPanel={() => setPlaylistClosed((s) => !s)}
            playbackRate={playbackRate}
            playing={playing}
            ready={mediaReadyState >= HTMLMediaElement.HAVE_METADATA}
            showMontageToggle={isPlayingVideo}
            totalTime={totalTime}
          />
        )}
      </div>
      <Playlist
        closed={playlistClosed}
        dark={isViewing || isPlayingMedia}
        files={mediaPlaylist}
        maximised={playlistMaximised}
        onChangePosition={setMediaPlaylistPosition}
        position={mediaPlaylistPosition}
      />
    </div>
  );
};
