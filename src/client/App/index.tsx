import mapDefined from "@xtjs/lib/js/mapDefined";
import classNames from "@xtjs/lib/js/classNames";
import { Duration } from "luxon";
import React, { useEffect, useRef, useState } from "react";
import { ListedMedia, ListedPhoto } from "../../api/listFiles";
import { useElemDimensions } from "../_common/ui";
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

  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const [mediaPlaylist, setMediaPlaylist] = useState<ListedMedia[]>([]);
  const [mediaPlaylistPosition, setMediaPlaylistPosition] =
    useState<number>(-1);
  const [photo, setPhoto] = useState<ListedPhoto | undefined>(undefined);
  const [path, setPath_callChangePathInstead] = useState<Array<string>>([]);
  const changePath = (newPath: string[]) => {
    setSearchValue("");
    setPath_callChangePathInstead(newPath);
  };
  const [playlistClosed, setPlaylistClosed] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState<
    Duration | undefined
  >(undefined);
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
  const [canShowPlaylistToggle, setCanShowPlaylistToggle] = useState(false);

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
    setIsIdle(false);
    // mousemove/pointermove don't seem to trigger continuously for touch.
    const EVENTS = ["pointerdown", "pointermove", "touchmove"];
    const listener = () => {
      setIsIdle(false);
      clearTimeout(isIdleTimeout.current);
      isIdleTimeout.current = setTimeout(() => setIsIdle(true), 1500);
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
    isViewing && isIdle && (playlistClosed || !playlistMaximised);

  return (
    <div
      className={classNames(
        "app",
        isViewing && "app-dark",
        `app-pt-${pointerType}`,
        (width < 500 || height < 450) && "app-tucked",
        isCurrentlyImmersed && "app-immersed"
      )}
      ref={(elem) => setAppElem(elem ?? undefined)}
    >
      <Explorer
        filter={searchValue}
        onClickFolder={(f) => changePath(path.concat(f))}
        onClickMediaFile={(files, file) => {
          setMediaPlaylist(files);
          setMediaPlaylistPosition(files.indexOf(file));
        }}
        onClickPhotoFile={(f) => setPhoto(f)}
        path={path}
        reserveRightSpace={!playlistClosed && !playlistMaximised}
      />
      {isPlayingMedia && (
        <Media
          mediaRef={mediaRef}
          next={mediaPlaylist[mediaPlaylistPosition + 1]}
          file={media}
          onEnded={() => setMediaPlaylistPosition((i) => i + 1)}
          onPlaybackChange={(playing) => setPlaying(playing)}
          onRequestNext={() => setMediaPlaylistPosition((p) => p + 1)}
          onTimeUpdate={(currentTime) =>
            setCurrentPlaybackTime(Duration.fromMillis(currentTime * 1000))
          }
        />
      )}
      {photo && <Image file={photo} />}
      <Path
        components={path}
        onChangeSearchValue={setSearchValue}
        onNavigate={changePath}
        onRequestOpenPlaylist={() => setPlaylistClosed(false)}
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
        showPlaylistToggle={canShowPlaylistToggle && playlistClosed}
        showSearch={!isViewing}
        useMenu={pathUseMenu}
      />
      <Playlist
        closed={playlistClosed}
        files={mediaPlaylist}
        maximised={playlistMaximised}
        onChangePosition={setMediaPlaylistPosition}
        onRequestClose={() => setPlaylistClosed(true)}
        position={mediaPlaylistPosition}
        showCloseButton={canShowPlaylistToggle}
      />
      {isPlayingMedia && (
        <Playback
          canShowCard={!isCurrentlyImmersed}
          currentTime={currentTime}
          file={media}
          mediaRef={mediaRef}
          // When the details button isn't showing, pressing the details
          // shows the extended details card.
          // When the details button is showing, pressing the details
          // toggles the playlist instead.
          // When Playback is hidden (i.e. no playback started), this will
          // always be true.
          onDetailsButtonVisibilityChange={(showing) =>
            setCanShowPlaylistToggle(!showing)
          }
          onTogglePlaylistPanel={() => setPlaylistClosed((s) => !s)}
          playing={playing}
          reserveRightSpace={!playlistClosed && !playlistMaximised}
          totalTime={totalTime}
        />
      )}
    </div>
  );
};
