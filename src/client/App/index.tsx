import classNames from "extlib/js/classNames";
import mapDefined from "extlib/js/mapDefined";
import { Duration } from "luxon";
import React, { useCallback, useRef, useState } from "react";
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

  const Path = useCallback(
    () => <PathImpl components={path} onNavigate={(p) => setPath(p)} />,
    [path]
  );

  const [appElem, setAppElem] = useState<HTMLDivElement | undefined>(undefined);
  const { width: appWidth } = useElemDimensions(appElem);
  const playlistMaximised = appWidth < 860;
  const playbackTucked = appWidth < 500;

  return (
    <div
      className={classNames("app", (photo || isPlayingVideo) && "app-dark")}
      ref={(elem) => setAppElem(elem ?? undefined)}
    >
      <Menu Path={Path} />
      <Explorer
        extended={playlistClosed || playlistMaximised}
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
          tucked={playbackTucked}
          extended={playlistClosed || playlistMaximised}
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
