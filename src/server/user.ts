import {promises as fs} from "fs";
import path from "path";

export interface User {
  file: string;
  username: string;
  password: string;
  favouriteVideos: Set<string>;
}

const getUser = async (usersDir: string, file: string): Promise<User> => {
  const raw = await fs.readFile(path.join(usersDir, `${file}.json`), "utf8");
  const json = JSON.parse(raw);
  return {
    file,
    username: json.username,
    password: json.password,
    favouriteVideos: new Set<string>(json.favouriteVideos),
  };
};

export const getUsers = async (usersDir: string): Promise<User[]> => {
  const dirents = await fs.readdir(usersDir, {withFileTypes: true});
  const files = dirents.filter(e => e.isFile() && e.name.toLowerCase().endsWith(".json"));
  return Promise.all(files.map(f => getUser(usersDir, f.name.slice(0, -5))));
};

export const writeUser = async (usersDir: string, user: User): Promise<void> => {
  const json = {
    username: user.username,
    password: user.password,
    favouriteVideos: [...user.favouriteVideos],
  };
  const raw = JSON.stringify(json, null, 2);
  await fs.writeFile(path.join(usersDir, `${user.file}.json`), raw);
};
