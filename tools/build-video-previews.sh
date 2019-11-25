#!/usr/bin/env bash

set -e

error() {
  echo >&2 "$1"
  exit 1
}

require_value() {
  if [ -z "$2" ]; then
    error "Missing value for $1"
  fi
  echo "$2"
}

while [[ $# -gt 0 ]]; do
  key="$1"
  value="$2"
  case $key in
  --source)
    SOURCE="$(require_value $key "$value")"
    shift
    shift
    ;;

  --output)
    OUTPUT="$(require_value $key "$value")"
    shift
    shift
    ;;

  *) # unknown option
    error "Unknown option $key"
    ;;
  esac
done

if [ -z "$SOURCE" ]; then error "No source folder"; fi
if [ -z "$OUTPUT" ]; then error "No output folder"; fi

# NOTE: These will fail as this script exits on errors.
source_dir_abs="$(realpath -e "$SOURCE")"
output_dir_abs="$(realpath -e "$OUTPUT")"

find "$source_dir_abs" -type f -regex '.+\.\(m4v\|mp4\)$' -print0 | {
  while IFS= read -r -d $'\0' file; do
    # Get relative path from source folder to source file.
    rel_path="$(realpath --relative-to="$source_dir_abs" "$file")"

    # Get duration of video in seconds.
    duration="$(ffprobe -v error -show_entries format=duration \
      -of default=noprint_wrappers=1:nokey=1 "$file")"

    echo "Processing $rel_path..."
    for i in {0..9}; do
      pos="$(bc -l <<<"scale=2; $duration * $i / 10")"
      dest="$output_dir_abs/$rel_path/$i.jpg"
      if [ -f "$dest" ]; then
        continue
      fi
      mkdir -p "$(dirname "$dest")"
      # Redirect stdin to prevent it from reading files list (i.e. this loop).
      ffmpeg -loglevel quiet -hide_banner -n -ss "$pos" -i "$file" -vframes 1 -q:v 2 "$dest" < /dev/null || continue
    done
  done
}
