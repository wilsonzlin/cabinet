import {Library} from '../library/model';
import {User} from './user';

export type Context = {
  library: Library;
  // Path to scratch directory if available.
  scratch?: string;
  authentication?: {
    users: User[];
    sessions: Map<string, User>;
    writeUser: (user: User) => Promise<void>;
  };
  user: User;
};
