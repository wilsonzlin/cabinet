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

  --dry)
    DRY_RUN=true
    shift # past argument
    ;;

  *) # unknown option
    error "Unknown option $key"
    ;;
  esac
done

if [ -z "$SOURCE" ]; then error "No source folder"; fi
if [ -z "$OUTPUT" ]; then error "No output folder"; fi
if [ -z "$DRY_RUN" ]; then DRY_RUN=false; fi

# NOTE: These will fail as this script exits on errors.
source_dir_abs="$(realpath -e "$SOURCE")"
output_dir_abs="$(realpath -e "$OUTPUT")"

find "$source_dir_abs" -type f -regex '.+\.\(wmv\|mkv\|avi\|rm\|rmvb\|flv\|3gp\)$' -print0 | while IFS= read -r -d $'\0' file; do
  # Get relative path from source folder to source file.
  rel_path="$(realpath --relative-to="$source_dir_abs" "$file")"

  # Get absolute path to converted output file with extension replaced with 'mp4'.
  dest="$output_dir_abs/${rel_path%.*}.mp4"

  # Ensure folder containing output exists.
  mkdir -p "$(dirname "$dest")"

  # Don't convert if already converted.
  if [ -f "$dest" ]; then
    continue
  fi

  echo -e "\033[0;32m\033[1m[$(date "+%a %d %b %H:%M")] Converting:\033[0m $rel_path"
  if [ "$DRY_RUN" = true ]; then
    continue
  fi

  echo
  ffmpeg \
    -hide_banner \
    -i "$file" \
    -c:v libx264 \
    -map_metadata -1 \
    -preset veryfast \
    -crf 17 \
    -max_muxing_queue_size 1048576 \
    -movflags \
    +faststart \
    "$dest" < /dev/null
  echo
done

exit 0
