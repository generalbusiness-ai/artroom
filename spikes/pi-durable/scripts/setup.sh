#!/bin/sh
# Extracts the Artroom sources this spike runs against, at pinned commits,
# into vendor/ (ignored by git). Run from anywhere inside the repository.
#   - lane A's Room (with lanes B, C and L it integrates): request/laneA-room
#   - lane E's client library: request/laneE-clients
set -eu
ROOM_REV=4a7c4af6e48201e7fb25a2571c1d385eff118b17
CLIENT_REV=cb1767dddf08b2d518e97ad7333053c2ba05e835
here=$(cd "$(dirname "$0")/.." && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
mkdir -p "$here/vendor/artroom"
git -C "$repo" archive "$ROOM_REV" tsconfig.base.json packages/contract packages/git packages/log packages/policy packages/room | tar -x -C "$here/vendor/artroom"
git -C "$repo" archive "$CLIENT_REV" packages/client | tar -x -C "$here/vendor/artroom"
printf 'room %s\nclient %s\n' "$ROOM_REV" "$CLIENT_REV" > "$here/vendor/REVISIONS"
echo "vendor/ ready: room $ROOM_REV, client $CLIENT_REV"
