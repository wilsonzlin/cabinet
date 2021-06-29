const PCM_CODECS = [
  "pcm_s16be",
  "pcm_s16le",
  "pcm_s24be",
  "pcm_s24le",
  "pcm_s32be",
  "pcm_s32le",
  "pcm_s64be",
  "pcm_s64le",
  "pcm_s8",
  "pcm_u16be",
  "pcm_u16le",
  "pcm_u24be",
  "pcm_u24le",
  "pcm_u32be",
  "pcm_u32le",
  "pcm_u64be",
  "pcm_u64le",
  "pcm_u8",
];

export const MEDIA_EXTENSIONS = new Set([
  "3gp",
  "aac",
  "avi",
  "flac",
  "flv",
  "gifv",
  "m2v",
  "m4v",
  "mka",
  "mkv",
  "mp3",
  "mp4",
  "mpeg",
  "mpg",
  "oga",
  "ogg",
  "ogv",
  "opus",
  "rm",
  "rmvb",
  "wav",
  "webm",
  "wmv",
]);

export const PHOTO_EXTENSIONS = new Set([
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
]);

export const BROWSER_SUPPORTED_MEDIA_CONTAINER_FORMATS = new Map<
  string,
  {
    argValue?: string;
    audioCodecs: Set<string>;
    videoCodecs: Set<string>;
  }
>([
  [
    "aac",
    {
      argValue: "alac",
      audioCodecs: new Set(["aac"]),
      videoCodecs: new Set(),
    },
  ],
  [
    "flac",
    {
      audioCodecs: new Set(["flac"]),
      videoCodecs: new Set(),
    },
  ],
  [
    "matroska,webm",
    {
      argValue: "webm",
      audioCodecs: new Set(["opus", "vorbis"]),
      videoCodecs: new Set(["av1", "vp8", "vp9"]),
    },
  ],
  [
    "mov,mp4,m4a,3gp,3g2,mj2",
    {
      // Sources:
      // - https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Containers#mpeg-4_mp4
      // - https://www.w3.org/2008/WebVideo/Fragments/wiki/State_of_the_Art/Containers
      argValue: "mp4",
      audioCodecs: new Set(["aac", "alac", "flac", "mp3", "opus", "vorbis"]),
      videoCodecs: new Set(["av1", "h264", "vp9"]),
    },
  ],
  [
    "mp3",
    {
      audioCodecs: new Set(["mp3"]),
      videoCodecs: new Set(),
    },
  ],
  [
    "ogg",
    {
      audioCodecs: new Set(["opus", "vorbis"]),
      videoCodecs: new Set(["theora"]),
    },
  ],
  [
    "wav",
    {
      audioCodecs: new Set(PCM_CODECS),
      videoCodecs: new Set(),
    },
  ],
]);

export const findSuitableContainer = (
  videoCodec?: string,
  audioCodec?: string
) => {
  for (const [k, v] of BROWSER_SUPPORTED_MEDIA_CONTAINER_FORMATS) {
    if (
      (audioCodec == undefined || v.audioCodecs.has(audioCodec)) &&
      (videoCodec == undefined || v.videoCodecs.has(videoCodec))
    ) {
      return v.argValue ?? k;
    }
  }
  return undefined;
};

export const BROWSER_SUPPORTED_VIDEO_CODECS = new Set([
  "av1",
  "h264",
  "hevc",
  "theora",
  "vp8",
  "vp9",
]);

export const BROWSER_SUPPORTED_AUDIO_CODECS = new Set([
  "aac",
  "flac",
  "mp3",
  ...PCM_CODECS,
  "vorbis",
]);
