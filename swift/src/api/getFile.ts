import {nullStat} from 'extlib/js/fs/stats/getStats';
import {nullParseNumber} from 'extlib/js/number/parse';
import {assertExists} from 'extlib/js/optional/assert';
import {mapOptional} from 'extlib/js/optional/map';
import {defined} from 'extlib/js/optional/pred';
import {dirname, join} from 'path';
import {DirEntryType, Video} from '../library/model';
import {Context} from '../server/context';
import {NOT_FOUND, SendFile, Status, StreamFile} from '../server/response';
import {ffVideo} from '../util/ff';
import {ensureDir} from '../util/fs';

const streamVideoCapture = async ({
  ctx,
  video,
  start,
  end,
  type,
  silent,
}: {
  ctx: Context;
  video: Video;
  start: number | null;
  end: number | null;
  type: string;
  silent: boolean;
}) => {
  const {scratch} = ctx;
  if (!scratch) {
    return NOT_FOUND;
  }

  if (start == null || start < 0 || start > video.duration || end == null || end < 0 || end > video.duration) {
    return new Status(400, 'Bad range');
  }

  const duration = end - start + 1;
  if (duration >= 60) {
    return new Status(400, 'Too long');
  }

  const mime = {
    'gif': 'image/gif',
    'low': 'video/mp4',
    'medium': 'video/mp4',
    'high': 'video/mp4',
    'original': 'video/mp4',
  }[type];
  if (!mime) {
    return new Status(400, 'Invalid type');
  }

  const audio = type != 'gif' && !silent;

  const outputFile = join(scratch, video.relativePath, `capture.${start}-${end}.${type}${audio ? `` : `.silent`}`);
  await ensureDir(dirname(outputFile));
  let outputFileStats = await nullStat(outputFile);
  if (!outputFileStats) {
    await ffVideo({
      input: {
        file: video.absolutePath,
        start,
        duration,
      },
      metadata: false,
      video: type == 'gif' ? {
        codec: 'gif',
        loop: true,
        fps: Math.min(10, video.fps),
        resize: {width: Math.min(800, video.width)},
      } : {
        codec: 'libx264',
        preset: 'veryfast',
        crf: 17,
        fps: Math.min(type == 'low' ? 10 : type == 'medium' ? 30 : type == 'high' ? 60 : Infinity, video.fps),
        resize: {width: Math.min(type == 'low' ? 800 : type == 'medium' ? 1280 : type == 'high' ? 1920 : Infinity, video.width)},
        faststart: true,
      },
      audio: type != 'gif' && audio,
      output: {
        format: type == 'gif' ? 'gif' : 'mp4',
        file: outputFile,
      },
    });
    outputFileStats = assertExists(await nullStat(outputFile));
  }
  return new StreamFile(
    outputFile,
    outputFileStats.size,
    mime,
    `${video.name} (capture ${duration}s, ${type}${audio ? '' : ', silent'})`,
  );
};

export const getFileApi = async ({
  ctx,
  path,

  thumbnail,
  snippet,
  montageFrame,
  start,
  end,
  type,
  silent,
}: {
  ctx: Context;
  path: string;

  // Possible query parameters.
  thumbnail?: boolean;
  snippet?: boolean;
  montageFrame?: string;
  start?: string;
  end?: string;
  type?: string;
  silent: boolean;
}) => {
  const file = ctx.library.getFile(path);
  switch (file?.type) {
  case DirEntryType.PHOTO:
    return new SendFile(file.absolutePath);

  case DirEntryType.VIDEO:
    switch (true) {
    case thumbnail:
      return mapOptional(file.preview?.thumbnailPath, path => new SendFile(path)) ?? NOT_FOUND;

    case snippet:
      return mapOptional(file.preview?.snippet, ({path, size}) => new StreamFile(path, size, 'video/mp4', file.name)) ?? NOT_FOUND;

    case defined(montageFrame):
      // All query parameter values should be strings due to `query parser` Express app setting.
      return mapOptional(file.preview?.montageFrames[montageFrame || ''], path => new SendFile(path)) ?? NOT_FOUND;

    case defined(start):
    case defined(end):
      return await streamVideoCapture({
        ctx,
        video: file,
        // All query parameter values should be strings due to `query parser` Express app setting.
        start: nullParseNumber(start || ''),
        end: nullParseNumber(end || ''),
        type: type || '',
        silent,
      });

    default:
      return new StreamFile(file.absolutePath, file.size, file.mime, file.name);
    }

  case undefined:
    return NOT_FOUND;
  }
};
