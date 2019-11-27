#!/usr/bin/env bash

set -e
shopt -s globstar
shopt -s nullglob
shopt -s nocaseglob

error() {
  echo >&2 "$1"
  exit 1
}

ff_args=(ffmpeg -loglevel 0 -hide_banner -y)

require_value() {
  if [ -z "$2" ]; then
    error "Missing value for $1"
  fi
  echo "$2"
}

exclusive_run_result=false
# Use the exclusive_run_result global variable instead of return codes for this function,
# as we usually want to ignore failed lock acquisitions.
exclusive_run() {
  local file="$1"
  shift
  mkdir -p "$(dirname "$file")"
  if [ ! -f "$file" ]; then
    subshell_error_code=0
    (
      flock_error_code=0
      flock -xn 9 || flock_error_code=$?
      if [[ $flock_error_code -eq 0 ]]; then
        "$@" </dev/null
        return 0
      fi
      return 1
    ) 9>"$file" || subshell_error_code=$?

    if [[ $subshell_error_code -eq 0 ]]; then
      exclusive_run_result=true
      return
    fi
  fi
  exclusive_run_result=false
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

# NOTE: These will fail as this script exits on errors.
source_dir_abs="$(realpath -e "$SOURCE")"
output_dir_abs="$(realpath -e "$OUTPUT")"

for file in "$source_dir_abs"/**/*.{wmv,mkv,avi,rm,rmvb,flv,3gp,mp4,m4v}; do
  # Get relative path from source folder to source file.
  rel_path="$(realpath --relative-to="$source_dir_abs" "$file")"

  # Get duration of video in seconds.
  duration="$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$file")"

  echo "Processing $rel_path..."

  # Create thumbnails at percentiles.
  for thumb_no in {0..9}; do
    thumb_pos="$(bc -l <<<"scale=2; $duration * $thumb_no / 10")"
    thumb_dest="$output_dir_abs/$rel_path/${thumb_no}0.jpg"
    exclusive_run "$thumb_dest" "${ff_args[@]}" -ss "$thumb_pos" -i "$file" -vframes 1 -q:v 2 "$thumb_dest"
  done

  # Create preview snippet.
  snippet_duration=5
  # TODO Videos shorter than $snippet_duration.
  snippet_pos="$(bc -l <<<"scale=2; $duration * 0.5 - ($snippet_duration / 2)")"
  snippet_dest="$output_dir_abs/$rel_path/snippet.mp4"
  exclusive_run "$snippet_dest" "${ff_args[@]}" \
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
  montage_shot_dest_folder="$output_dir_abs/$rel_path/montage"
  # Check before continuing as temporary montage shot files would have already been deleted.
  if [ -f "$montage_dest" ]; then
    continue
  fi
  montage_granularity=200
  montage_shots=()
  for ((montage_shot_no = 0; montage_shot_no < montage_granularity; montage_shot_no++)); do
    montage_shot_pos="$(bc -l <<<"scale=2; $duration * $montage_shot_no / $montage_granularity")"
    montage_shot_dest="$montage_shot_dest_folder/${montage_shot_no}.jpg"
    montage_shots+=("$montage_shot_dest")
    exclusive_run "$montage_shot_dest" "${ff_args[@]}" \
      -ss "$montage_shot_pos" \
      -i "$file" \
      -vframes 1 \
      -q:v 2 \
      "$montage_shot_dest"
  done
  exclusive_run "$montage_dest" convert "${montage_shots[@]}" +append -resize x120 "$montage_dest"
  if [ "$exclusive_run_result" = true ]; then
    rm -rf "$montage_shot_dest_folder"
  fi
done
