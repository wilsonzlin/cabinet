import { Duration } from "luxon";
import React, { useRef, useState } from "react";
import { ListedMedia, ListedPhoto } from "../../api/listFiles";
import Explorer from "../Explorer";
import Image from "../Image";
import Media from "../Media";
import Menu from "../Menu";
import Path from "../Path";
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
  const [playlistClosed, setPlaylistClosed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState<
    Duration | undefined
  >(undefined);

  const media: ListedMedia | undefined = mediaPlaylist[mediaPlaylistPosition];
  const isPlayingVideo = media?.type == "video";
  const isPlayingMedia = media?.type == "audio" || isPlayingVideo;

  return (
    <div className="app">
      <Menu
        Path={() => <Path components={path} onNavigate={(p) => setPath(p)} />}
      />
      <Explorer
        extended={playlistClosed}
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
        dark={!!photo || isPlayingVideo}
        files={mediaPlaylist}
        position={mediaPlaylistPosition}
        onChangePosition={setMediaPlaylistPosition}
        onRequestClose={() => setPlaylistClosed(true)}
      />
      {isPlayingMedia && (
        <Playback
          mediaRef={mediaRef.current}
          dark={!!photo || isPlayingVideo}
          extended={playlistClosed}
          hideAutomatically={!!photo || isPlayingVideo}
          playing={playing}
          progress={
            !currentPlaybackTime
              ? undefined
              : {
                  current: currentPlaybackTime,
                  total: Duration.fromMillis(media.duration * 1000),
                }
          }
          file={media}
        />
      )}
      {playlistClosed && (
        <PlaylistToggle
          dark={!!photo || isPlayingVideo}
          onRequestOpenPlaylist={() => setPlaylistClosed(false)}
        />
      )}
    </div>
  );
};
