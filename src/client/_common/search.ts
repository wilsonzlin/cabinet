export const parseSearchFilter = (raw: string) => {
  let subdirectories = false;
  raw = raw.trim();
  if (raw.startsWith("~")) {
    subdirectories = true;
    raw = raw.slice(1).trim();
  }
  if (raw.length <= 1) {
    return { filter: undefined, subdirectories: false };
  }
  return { filter: raw, subdirectories };
};
