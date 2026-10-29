#!/usr/bin/env bash
# Clone or update the 5etools data and image mirrors on the server.
#
#   /var/www/jane-assets/5etools        <- 5etools-mirror-3/5etools-src  (data/ lives here)
#   /var/www/jane-assets/5etools/img    <- 5etools-mirror-3/5etools-img  (served at /5etools/)
#
# Usage (run on the server):
#   bash update_5etools_repos.sh             # fetch latest and reset both checkouts
#   bash update_5etools_repos.sh --replace   # first time: move the old non-git folder aside, then clone
#
# The old folder is moved to <BASE>.old-<timestamp>, not deleted. Delete it after verifying the new checkout.
set -euo pipefail

BASE="${FIVE_ETOOLS_BASE:-/var/www/jane-assets/5etools}"
SRC_URL="https://github.com/5etools-mirror-3/5etools-src.git"
IMG_URL="https://github.com/5etools-mirror-3/5etools-img.git"
REPLACE=0

if [ "${1:-}" = "--replace" ]; then
    REPLACE=1
fi

update_repo() {
    local url="$1" dir="$2" branch
    if [ -d "$dir/.git" ]; then
        branch="$(git -C "$dir" symbolic-ref --short HEAD)"
        echo ">> Updating $dir ($branch)"
        git -C "$dir" fetch --depth 1 origin "$branch"
        git -C "$dir" reset --hard FETCH_HEAD
        return
    fi
    if [ -e "$dir" ]; then
        if [ "$REPLACE" -ne 1 ]; then
            echo "ERROR: $dir exists and is not a git checkout. Re-run with --replace to move it aside." >&2
            exit 1
        fi
        local backup="$dir.old-$(date +%Y%m%d%H%M%S)"
        echo ">> Moving $dir -> $backup"
        mv "$dir" "$backup"
    fi
    echo ">> Cloning $url -> $dir"
    git clone --depth 1 "$url" "$dir"
}

# Clone the data repo first: it ignores img/, so the image checkout nests cleanly inside it.
update_repo "$SRC_URL" "$BASE"
update_repo "$IMG_URL" "$BASE/img"

echo ">> Done. Data commit: $(git -C "$BASE" rev-parse --short HEAD)  Image commit: $(git -C "$BASE/img" rev-parse --short HEAD)"
echo ">> Next: re-run the 5etools -> MySQL sync scripts so the tables pick up the new data."
