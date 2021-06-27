import classNames from "extlib/js/classNames";
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

export default ({}: {}) => {
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const [mediaPlaylist, setMediaPlaylist] = useState<ListedMedia[]>([]);
  const [mediaPlaylistPosition, setMediaPlaylistPosition] =
    useState<number>(-1);
  const [photo, setPhoto] = useState<ListedPhoto | undefined>(undefined);
  const [path, setPath] = useState<Array<string>>([]);
  const [playlistClosed, setPlaylistClosed] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState<
    Duration | undefined
  >(undefined);

  const media: ListedMedia | undefined = mediaPlaylist[mediaPlaylistPosition];
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

  return (
    <div
      className={classNames(
        "app",
        isViewing && "app-dark",
        `app-pt-${pointerType}`,
        (width < 500 || height < 450) && "app-tucked"
      )}
      ref={(elem) => setAppElem(elem ?? undefined)}
    >
      <Explorer
        reserveRightSpace={!playlistClosed && !playlistMaximised}
        path={path}
        onClickFolder={(f) => setPath((p) => p.concat(f))}
        onClickMediaFile={(files, file) => {
          setMediaPlaylist(files);
          setMediaPlaylistPosition(files.indexOf(file));
        }}
        onClickPhotoFile={(f) => setPhoto(f)}
      />
      {isPlayingMedia && (
        <Media
          mediaRef={mediaRef}
          file={media}
          onEnded={() => setMediaPlaylistPosition((i) => i + 1)}
          onPlaybackChange={(playing) => setPlaying(playing)}
          onTimeUpdate={(currentTime) =>
            setCurrentPlaybackTime(Duration.fromMillis(currentTime * 1000))
          }
        />
      )}
      {photo && <Image file={photo} />}
      <Path
        components={path}
        onNavigate={(p) => setPath(p)}
        onRequestOpenPlaylist={() => setPlaylistClosed(false)}
        onRequestClose={() => {
          if (photo) {
            setPhoto(undefined);
          } else {
            setMediaPlaylistPosition(-1);
          }
        }}
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
          mediaRef={mediaRef}
          reserveRightSpace={!playlistClosed && !playlistMaximised}
          hideAutomatically={isViewing}
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
          currentTime={currentPlaybackTime ?? Duration.fromMillis(0)}
          totalTime={Duration.fromMillis(media.duration * 1000)}
          file={media}
        />
      )}
    </div>
  );
};
