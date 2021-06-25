import { Duration } from "luxon";
import React, { useRef, useState } from "react";
import { ListedAudio, ListedPhoto, ListedVideo } from "../../api/listFiles";
import Explorer from "../Explorer";
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
  const [currentFile, setCurrentFile] = useState<
    ListedAudio | ListedPhoto | ListedVideo | undefined
  >(undefined);
  const [path, setPath] = useState<Array<string>>([]);
  const [playlistClosed, setPlaylistClosed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState<
    Duration | undefined
  >(undefined);

  const dark = currentFile?.type == "video";

  return (
    <div className="app">
      {currentFile?.type == "video" && (
        <Media
          mediaRef={mediaRef.current}
          source={`/getFile?${JSON.stringify({ path: currentFile.path })}`}
          /* TODO */
          onEnded={() => void 0}
          onPlaybackChange={(playing) => setPlaying(playing)}
          onTimeUpdate={(currentTime) =>
            setCurrentPlaybackTime(Duration.fromMillis(currentTime * 1000))
          }
        />
      )}
      {currentFile == undefined && (
        <>
          <Menu
            Path={() => (
              <Path components={path} onNavigate={(p) => setPath(p)} />
            )}
          />
          <Explorer
            extended={playlistClosed}
            path={path}
            onClickFolder={(f) => setPath((p) => p.concat(f))}
            onClickFile={(v) => setCurrentFile(v)}
          />
        </>
      )}
      {playlistClosed && (
        <PlaylistToggle
          dark={dark}
          onRequestOpenPlaylist={() => setPlaylistClosed(false)}
        />
      )}
      <Playlist
        closed={playlistClosed}
        dark={dark}
        onRequestClose={() => setPlaylistClosed(true)}
        onStop={() => setCurrentFile(undefined)}
      />
      {currentFile &&
        (currentFile.type == "video" || currentFile.type == "audio") && (
          <Playback
            mediaRef={mediaRef.current}
            dark={dark}
            extended={playlistClosed}
            playing={playing}
            progress={
              !currentPlaybackTime
                ? undefined
                : {
                    current: currentPlaybackTime,
                    total: Duration.fromMillis(currentFile.duration * 1000),
                  }
            }
            file={{
              author: currentFile.author,
              path: currentFile.path,
              title: currentFile.title,
            }}
          />
        )}
    </div>
  );
};
