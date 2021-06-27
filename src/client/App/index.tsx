import classNames from "extlib/js/classNames";
import mapDefined from "extlib/js/mapDefined";
import { Duration } from "luxon";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ListedMedia, ListedPhoto } from "../../api/listFiles";
import { useElemDimensions } from "../_common/ui";
import Explorer from "../Explorer";
import Image from "../Image";
import Media from "../Media";
import Menu from "../Menu";
import PathImpl from "../Path";
import Playback from "../Playback";
import Playlist from "../Playlist";
import PlaylistToggle from "../PlaylistToggle";
import "./index.css";

export default ({}: {}) => {
  const mediaRef = useRef<{ element: HTMLMediaElement | undefined }>({
    element: undefined,
  });
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

  const [appElem, setAppElem] = useState<HTMLDivElement | undefined>(undefined);
  const { width, height } = useElemDimensions(appElem);
  const playlistMaximised = width < 860;
  const tucked = width < 500 || height < 450;
  const pathUseMenu = width < 1024;

  const Path = useCallback(
    () => (
      <PathImpl
        components={path}
        onNavigate={(p) => setPath(p)}
        useMenu={pathUseMenu}
      />
    ),
    [path, pathUseMenu]
  );

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
        (photo || isPlayingVideo) && "app-dark",
        `app-pt-${pointerType}`
      )}
      ref={(elem) => setAppElem(elem ?? undefined)}
    >
      <Menu Path={Path} tucked={tucked} />
      <Explorer
        reserveRightSpace={!playlistClosed && !playlistMaximised}
        tucked={tucked}
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
          mediaRef={mediaRef.current}
          file={media}
          onClose={() => setMediaPlaylistPosition(-1)}
          onEnded={() => setMediaPlaylistPosition((i) => i + 1)}
          onPlaybackChange={(playing) => setPlaying(playing)}
          onTimeUpdate={(currentTime) =>
            setCurrentPlaybackTime(Duration.fromMillis(currentTime * 1000))
          }
        />
      )}
      {photo && (
        <Image
          file={photo}
          path={path}
          onClose={() => setPhoto(undefined)}
          onNavigate={(path) => {
            setPath(path);
            setPhoto(undefined);
          }}
        />
      )}
      <Playlist
        closed={playlistClosed}
        maximised={playlistMaximised}
        files={mediaPlaylist}
        position={mediaPlaylistPosition}
        onChangePosition={setMediaPlaylistPosition}
        onRequestClose={() => setPlaylistClosed(true)}
      />
      {isPlayingMedia && (
        <Playback
          mediaRef={mediaRef.current}
          tucked={tucked}
          reserveRightSpace={!playlistClosed && !playlistMaximised}
          hideAutomatically={!!photo || isPlayingVideo}
          onTogglePlaylistPanel={
            playlistMaximised ? () => setPlaylistClosed((s) => !s) : undefined
          }
          playing={playing}
          progress={mapDefined(currentPlaybackTime, (current) => ({
            current,
            total: Duration.fromMillis(media.duration * 1000),
          }))}
          file={media}
        />
      )}
      {playlistClosed && !playlistMaximised && (
        <PlaylistToggle
          dark={!!photo || isPlayingVideo}
          onRequestOpenPlaylist={() => setPlaylistClosed(false)}
        />
      )}
    </div>
  );
};
