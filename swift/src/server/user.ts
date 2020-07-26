import {hasKey} from 'extlib/js/object/has';
import {promises as fs} from 'fs';
import path from 'path';

type Optional<T> = {
  [p in keyof T]?: T[p];
}

export interface VideoPreferences {
  usePrivacyCover: boolean;
  groupVideosByFolder: boolean;
  showVideoThumbnails: boolean;
  showVideoSnippets: boolean;
  showVideoMontage: boolean;
}

export const DefaultVideoPreferences: VideoPreferences = {
  groupVideosByFolder: true,
  usePrivacyCover: false,
  showVideoThumbnails: true,
  showVideoSnippets: true,
  showVideoMontage: true,
};

export const buildPreferences = <P> (userPrefs: Optional<P> | null | undefined, defaultPrefs: P): P =>
  !userPrefs
    ? {...defaultPrefs}
    : Object.fromEntries(
    Object.entries(defaultPrefs)
      .map(([prop, defVal]) => [prop, hasKey(userPrefs, prop) ? userPrefs[prop] : defVal]),
    ) as any;

export interface User {
  file: string;
  username: string;
  password: string;
  ratings: { [file: string]: boolean };
  videoPreferences: VideoPreferences;
}

const getUser = async (usersDir: string, file: string): Promise<User> => {
  const raw = await fs.readFile(path.join(usersDir, `${file}.json`), 'utf8');
  const json = JSON.parse(raw);
  return {
    file,
    username: json.username,
    password: json.password,
    ratings: json.ratings || {},
    videoPreferences: buildPreferences(json.videoPreferences, DefaultVideoPreferences),
  };
};

export const getUsers = async (usersDir: string): Promise<User[]> => {
  const dirents = await fs.readdir(usersDir, {withFileTypes: true});
  const files = dirents.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.json'));
  return Promise.all(files.map(f => getUser(usersDir, f.name.slice(0, -5))));
};

export const writeUser = async (usersDir: string, user: User): Promise<void> => {
  await fs.writeFile(path.join(usersDir, `${user.file}.json`), JSON.stringify({
    username: user.username,
    password: user.password,
    ratings: user.ratings,
    videoPreferences: user.videoPreferences,
  }, null, 2));
};
