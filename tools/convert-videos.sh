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

get_file_size() {
  du --apparent-size -b "$1" | cut -f 1
}

format_size() {
  numfmt --to=iec-i --suffix=B --format="%.2f" "$1"
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

  --touch)
    TOUCH=true
    shift # past argument
    ;;

  --stat)
    STAT=true
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
if [ -z "$TOUCH" ]; then TOUCH=false; fi
if [ -z "$STAT" ]; then STAT=false; fi

# NOTE: These will always be valid as this script exits on errors.
source_dir_abs="$(realpath -e "$SOURCE")"
output_dir_abs="$(realpath -e "$OUTPUT")"

# Use command grouping to allow statistical variables to be used after loop.
find "$source_dir_abs" -type f -regex '.+\.\(wmv\|mkv\|avi\|rm\|rmvb\|flv\|3gp\)$' -print0 | {
  # Variables for statistics, only used if $STAT is true.
  total_source_size=0
  total_output_size=0
  files_count=0

  while IFS= read -r -d $'\0' file; do
    # Get relative path from source folder to source file.
    rel_path="$(realpath --relative-to="$source_dir_abs" "$file")"

    # Get absolute path to converted output file with extension replaced with 'mp4'.
    dest="$output_dir_abs/${rel_path%.*}.mp4"
    # First convert to a temporary file so that if conversion does not finish successfully (e.g. script or system crashes),
    # when this script is run again, it will detect incompletion and restart the process.
    # We will acquire a lock later to ensure that other concurrently running scripts recognise that this file is in
    # processing rather than a failed past attempt.
    dest_incomplete="$dest.incomplete"

    # Ensure folder containing output exists.
    mkdir -p "$(dirname "$dest")"

    # Don't convert if already converted.
    if [ -f "$dest" ]; then
      if [ "$STAT" = true ]; then
        total_source_size=$((total_source_size + $(get_file_size "$file")))
        total_output_size=$((total_output_size + $(get_file_size "$dest")))
        files_count=$((files_count + 1))
      fi
      continue
    fi

    if [ "$STAT" = true ]; then
      continue
    fi

    echo -e "\033[0;32m\033[1m[$(date "+%a %d %b %H:%M")] Converting:\033[0m $rel_path"
    if [ "$DRY_RUN" = true ]; then
      continue
    fi

    # Touch mode only creates the file entries in the file system without writing any data.
    # This might be useful for testing purposes.
    # Files created by touching can be removed by finding files with zero bytes and deleting them.
    if [ "$TOUCH" = true ]; then
      touch "$dest"
      continue
    fi

    echo
    (
      # If this fails, skip to the next file, as some other concurrent execution of this script most likely
      # has the lock and is currently processing this file.
      flock -xn 9 || exit 0
      # ffmpeg has various non-zero exit codes that do not actually mean it failed, so ignore them and always treat as success.
      # -y: overwrite the file created by lock.
      # Redirect stdin to /dev/null to prevent reading from `find` result (i.e. files list this loop is iterating over).
      ffmpeg \
        -hide_banner \
        -y \
        -i "$file" \
        -c:v libx264 \
        -map_metadata -1 \
        -preset veryfast \
        -crf 17 \
        -max_muxing_queue_size 1048576 \
        -movflags \
        +faststart \
        -f mp4 \
        "$dest_incomplete" </dev/null || exit 0
      # WARNING: Make sure that if flock or ffmpeg fails this is not run!
      # If this fails, let the script die.
      mv "$dest_incomplete" "$dest"
    ) 9>"$dest_incomplete"
    echo
  done

  if [ "$STAT" = true ]; then
    avg_source_size="$(bc -l <<<"$total_source_size / $files_count")"
    avg_output_size="$(bc -l <<<"$total_output_size / $files_count")"
    ratio="$(bc -l <<<"scale=2; $avg_output_size * 100 / $avg_source_size")"
    echo "Average source size: $(format_size $avg_source_size)"
    echo "Average output size: $(format_size $avg_output_size)"
    echo "Total source size: $(format_size $total_source_size)"
    echo "Total output size: $(format_size $total_output_size)"
    echo "Total output size compared to source: $ratio%"
  fi
}

exit 0
