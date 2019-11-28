#!/usr/bin/env bash

set -e
shopt -s globstar
shopt -s nullglob
shopt -s nocaseglob

error() {
  echo >&2 "$1"
  exit 1
}

pyexpr() {
  python -c "print($1)"
}

# ffmpeg has various non-zero exit codes that do not actually mean it failed, so ignore them and always treat as success.
# -y: overwrite the file created by lock.
# Redirect stdin to /dev/null to prevent reading from this script's stdin.
ff_status=0
ff() {
  ff_status=0
  ffmpeg -loglevel 0 -hide_banner -y "$@" </dev/null || ff_status=$?
  return 0
}

require_value() {
  if [ -z "$2" ]; then
    error "Missing value for $1"
  fi
  echo "$2"
}

# Tries to lock FD 9 and execute a command. If lock acquisition fails, returns with status 1.
# If command fails, script is terminated.
function exclusive_run_helper() {
  # Use file descriptor instead of passing command so that we can call script functions.
  flock -xn 9 || return 1
  # Because this function is called followed by `||`, this command will not cause entire script to exit even with `set -e`.
  # Therefore, force it to exit the script if it fails.
  # This function exists because exit won't end the script from a subshell.
  "$@" || exit $?
}

did_exclusive_run=false
# Use the did_exclusive_run global variable instead of return codes for this function,
# as we usually want to ignore failed lock acquisitions and don't want to handle each call.
exclusive_run() {
  local file="$1"
  shift
  if [ ! -f "$file" ]; then
    lock_error_code=0
    exclusive_run_helper "$@" 9>"$file" || lock_error_code=$?
    if [[ $lock_error_code -eq 0 ]]; then
      did_exclusive_run=true
      return 0
    fi
  fi
  did_exclusive_run=false
}

while [[ $# -gt 0 ]]; do
  key="$1"
  value="$2"
  case $key in
  --source)
    SOURCE="$(require_value "$key" "$value")"
    shift
    shift
    ;;

  --output)
    OUTPUT="$(require_value "$key" "$value")"
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

# NOTE: These will always be valid as this script exits on errors.
source_dir_abs="$(realpath -e "$SOURCE")"
output_dir_abs="$(realpath -e "$OUTPUT")"

for file in "$source_dir_abs"/**/*.{mp4,m4v}; do
  # Get relative path from source folder to source file.
  rel_path="$(realpath --relative-to="$source_dir_abs" "$file")"

  # Get duration of video in seconds.
  duration="$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$file")"

  echo "Processing $rel_path..."
  mkdir -p "$output_dir_abs/$rel_path"

  # Create thumbnails at percentiles.
  for thumb_no in {0..9}; do
    thumb_pos="$(bc -l <<<"scale=2; $duration * $thumb_no / 10")"
    thumb_dest="$output_dir_abs/$rel_path/${thumb_no}0.jpg"
    exclusive_run "$thumb_dest" ff -ss "$thumb_pos" -i "$file" -vframes 1 -q:v 2 "$thumb_dest"
  done

  # Create preview snippet.
  snippet_duration=5
  # TODO Videos shorter than $snippet_duration.
  snippet_pos="$(bc -l <<<"scale=2; $duration * 0.5 - ($snippet_duration / 2)")"
  snippet_dest="$output_dir_abs/$rel_path/snippet.mp4"
  exclusive_run "$snippet_dest" ff \
    -ss "$snippet_pos" \
    -i "$file" \
    -filter:v scale="180:trunc(ow/a/2)*2" \
    -c:v libx264 \
    -map_metadata -1 \
    -preset veryslow \
    -crf 17 \
    -max_muxing_queue_size 1048576 \
    -movflags \
    +faststart \
    -an \
    -t "$snippet_duration" \
    -f mp4 \
    "$snippet_dest"

  # Create montage.
  montage_dest="$output_dir_abs/$rel_path/montage.jpg"
  montage_dest_incomplete="$output_dir_abs/$rel_path/montage.jpg.incomplete"
  nomontage="$output_dir_abs/$rel_path/.nomontage"
  if [ -f "$nomontage" ] || [ -f "$montage_dest" ]; then
    continue
  fi

  # It's more difficult to allow concurrent generation of montage shots, as one would have to
  # handle and coordinate cases where shots fail (and all montage attempts must be aborted),
  # wait for shots to finish before generating montage, etc. Process each video's montage
  # within a single instance of this script.
  # Concurrently generating montage shots is probably slower too with the constant lock trashing.
  (
    flock -xn 9 || exit 0

    # We want to get a shot every 2 seconds except for first and last 2 seconds, up to 200 shots.
    # More granularity would probably not be much use and exceed JPEG dimension limits.
    montage_granularity="$(pyexpr "min(200, int($duration / 2))")"

    if [[ $montage_granularity -le 2 ]]; then
      # Video is too short for a montage, so don't create one.
      touch "$nomontage"
      exit 0
    fi

    montage_shots=()
    montage_failed=false

    # Ignore first and last shots.
    for ((montage_shot_no = 1; montage_shot_no < montage_granularity; montage_shot_no++)); do
      montage_shot_pos="$(bc -l <<<"scale=2; $duration * $montage_shot_no / $montage_granularity")"
      # Avoid using subdirectories that might cause race conditions when creating and deleting concurrently.
      montage_shot_dest="$output_dir_abs/$rel_path/montageshot${montage_shot_no}.jpg"
      montage_shots+=("$montage_shot_dest")

      # Shouldn't need to lock $montage_shot_dest.
      ff \
        -ss "$montage_shot_pos" \
        -i "$file" \
        -vframes 1 \
        -q:v 2 \
        "$montage_shot_dest"

      if [[ "$(stat --printf="%s" "$montage_shot_dest")" -eq "0" ]]; then
        # Montage shot failed to be created. Don't create montage and don't try again in future.
        # Keep empty shot file so that no other concurrent scripts try to recreate it and which shots failed are known.
        montage_failed=true
        break
      fi
    done

    if [ "$montage_failed" = true ]; then
      touch "$nomontage"
      exit 0
    fi

    # Shouldn't need to lock $montage_dest.
    # Because of `set -e` and no `||` after subshell if this fails script will exit.
    convert "${montage_shots[@]}" +append -resize x120 "$montage_dest"
    rm -f "${montage_shots[@]}"
    mv "$montage_dest_incomplete" "$montage_dest"
  ) 9>"$montage_dest_incomplete"
done
