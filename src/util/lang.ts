export const ifDefined = <T> (val: T | undefined, fn: (val: T) => void) => {
  if (val !== undefined) {
    fn(val);
  }
};

export const optionalMap = <T, R> (val: T | null | undefined, mapper: (val: T) => R) => val == null ? undefined : mapper(val);

export const assertExists = <T> (val: T | null | undefined): T => {
  if (val == undefined) {
    throw new Error(`Unexpected undefined or null`);
  }
  return val;
};

export const isString = (val: unknown): val is string => typeof val == 'string';

export const isDefined = <T> (val: T | undefined): val is T => val !== undefined;

export const exists = <T> (val: T | null | undefined): val is T => val != undefined;

export const asyncFilterList = async <T> (list: T[], predicate: (val: T) => Promise<boolean>): Promise<T[]> =>
  (await Promise.all(list.map(async (e) => (await predicate(e)) ? e : null))).filter(exists);
