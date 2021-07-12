export const parseSearchFilter = (raw: string) => {
  let subdirectories = false;
  raw = raw.trim();
  if (raw.startsWith("~")) {
    subdirectories = true;
    raw = raw.slice(1).trim();
  }
  // SQLite3 FTS5 trigram search requires at least 3 characters.
  if (raw.length <= 2) {
    return { filter: undefined, subdirectories: false };
  }
  return { filter: raw, subdirectories };
};
