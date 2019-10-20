#!/usr/bin/env bash

set -e

cd "$(dirname "$0")"

converted_base_dir="$(realpath "$1")"
dry_run="$([ "$2" == "dry" ] && echo true || echo false)"

find . -type f -regex '.+\.\(wmv\|mkv\|avi\|rm\|rmvb\|flv\|3gp\)$' -print0 | while IFS= read -r -d $'\0' line; do
    CONVERTED_FILE="$converted_base_dir/${line%.*}.mp4"
    if [ ! -f "$CONVERTED_FILE" ]; then
        if [ "$dry_run" = true ]; then
            echo
            echo "==================== $(basename "$line") ===================="
            echo
            ffmpeg -hide_banner -i "$line" -c:v libx264 -map_metadata -1 -preset veryfast -crf 17 -max_muxing_queue_size 1048576 -movflags +faststart "$CONVERTED_FILE" < /dev/null
        else
            echo "==================== $(basename "$line") ===================="
        fi
    fi
done

exit 0
