import {promises as fs} from 'fs';
import path from 'path';

type Optional<T> = {
  [p in keyof T]?: T[p];
}

export interface VideoPreferences {
  usePrivacyCover: boolean;
  groupVideosByFolder: boolean;
  hideDislikedVideos: boolean;
  showVideoThumbnails: boolean;
}

export const DefaultVideoPreferences: VideoPreferences = {
  groupVideosByFolder: true,
  hideDislikedVideos: true,
  usePrivacyCover: false,
  showVideoThumbnails: true,
};

export const hasProp = (obj: object, prop: string) =>
  Object.prototype.hasOwnProperty.call(obj, prop);

export const buildPreferences = <P> (userPrefs: Optional<P> | null | undefined, defaultPrefs: P): P =>
  !userPrefs
    ? {...defaultPrefs}
    : Object.fromEntries(
    Object.entries(defaultPrefs)
      .map(([prop, defVal]) => [prop, hasProp(userPrefs, prop) ? userPrefs[prop] : defVal]));

export interface User {
  file: string;
  username: string;
  password: string;
  likedVideos: Set<string>;
  dislikedVideos: Set<string>;
  videoPreferences: VideoPreferences;
}

const getUser = async (usersDir: string, file: string): Promise<User> => {
  const raw = await fs.readFile(path.join(usersDir, `${file}.json`), 'utf8');
  const json = JSON.parse(raw);
  return {
    file,
    username: json.username,
    password: json.password,
    // Passing undefined or null to Set constructor is OK.
    likedVideos: new Set<string>(json.likedVideos),
    dislikedVideos: new Set<string>(json.dislikedVideos),
    videoPreferences: buildPreferences(json.videoPreferences, DefaultVideoPreferences),
  };
};

export const getUsers = async (usersDir: string): Promise<User[]> => {
  const dirents = await fs.readdir(usersDir, {withFileTypes: true});
  const files = dirents.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.json'));
  return Promise.all(files.map(f => getUser(usersDir, f.name.slice(0, -5))));
};

export const writeUser = async (usersDir: string, user: User): Promise<void> => {
  const json = {
    username: user.username,
    password: user.password,
    likedVideos: [...user.likedVideos],
    dislikedVideos: [...user.dislikedVideos],
    videoPreferences: user.videoPreferences,
  };
  const raw = JSON.stringify(json, null, 2);
  await fs.writeFile(path.join(usersDir, `${user.file}.json`), raw);
};
