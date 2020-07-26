import {UnreachableError} from 'extlib/js/assert/assert';
import {mapOptional} from 'extlib/js/optional/map';
import {DirEntryType, isNotDir} from '../library/model';
import {Context} from '../server/context';
import {Json, NOT_FOUND} from '../server/response';

export const listFilesApi = ({
  ctx,
  path,

  filter,
  subdirectories,
}: {
  ctx: Context;
  path: string;

  // Possible query parameters.
  filter?: string;
  subdirectories: boolean;
}) => {
  // TODO Filter, subdirectories.
  return mapOptional(ctx.library.getDirectory(path), dir => {
    const entries = Object.values(dir.entries);
    const files = entries.filter(isNotDir);
    const size = files.reduce((t, f) => t + f.size, 0);
    const duration = files.reduce((t, f) => t + (f.type == DirEntryType.VIDEO ? f.duration : 0), 0);
    return new Json({
      approximateSize: size,
      approximateDuration: duration,
      approximateCount: entries.length,
      results: entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(e => {
          switch (e.type) {
          case DirEntryType.DIRECTORY:
            return {
              type: 'dir',
              name: e.name,
              itemCount: Object.keys(e.entries).length,
            };

          case DirEntryType.PHOTO:
            return {
              type: 'photo',
              id: e.relativePath,
              // TODO Encode path
              url: `/file/${e.relativePath}`,
              title: e.name,
              size: e.size,
              format: e.mime,
              metadata: {},
              width: e.width,
              height: e.height,
            };

          case DirEntryType.VIDEO:
            return {
              type: 'video',
              id: e.relativePath,
              // TODO Encode path
              url: `/file/${e.relativePath}`,
              title: e.name,
              size: e.size,
              format: e.mime,
              metadata: {},
              // TODO Encode path
              thumbnail: `/file/${e.relativePath}?thumbnail=1`,
              width: e.width,
              height: e.height,
              duration: e.duration,
            };

          default:
            throw new UnreachableError(e);
          }
        }),
    });
  }) ?? NOT_FOUND;
};
