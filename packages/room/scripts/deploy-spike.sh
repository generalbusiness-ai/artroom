#!/usr/bin/env bash
# Deploy (or redeploy) the spike Room Worker, artroom-spike-room, from
# wrangler.spike.jsonc with hugh's wrangler OAuth login.
#
#   packages/room/scripts/deploy-spike.sh
#
# It reads ROOM_KEY_SECRET from ~/.config/generalbusiness/artroom-spike.env
# (or $ARTROOM_SPIKE_ENV), puts it with `wrangler secret put` on stdin, then
# deploys. It never prints, logs or writes the secret. The same value on
# every run keeps existing rooms' keys and repository identities stable.
set -euo pipefail

ENV_FILE=${ARTROOM_SPIKE_ENV:-$HOME/.config/generalbusiness/artroom-spike.env}
HERE=$(cd "$(dirname "$0")/.." && pwd)
CONFIG=$HERE/wrangler.spike.jsonc
URL=https://artroom-spike-room.inguz.workers.dev
WRANGLER=(env -u CLOUDFLARE_API_TOKEN npx -y wrangler@latest)

[[ -f $ENV_FILE ]] || { echo "deploy-spike: $ENV_FILE is missing" >&2; exit 2; }
mode=$(stat -f %Lp "$ENV_FILE" 2>/dev/null || stat -c %a "$ENV_FILE")
[[ $mode == 600 ]] || { echo "deploy-spike: $ENV_FILE must be mode 600 (it is $mode)" >&2; exit 2; }

# The value only; the file is not sourced, so nothing else in it runs or is exported.
secret=$(sed -nE 's/^ROOM_KEY_SECRET=["'\'']?([^"'\'']*)["'\'']?$/\1/p' "$ENV_FILE")
[[ -n $secret ]] || { echo "deploy-spike: ROOM_KEY_SECRET is not set in $ENV_FILE" >&2; exit 2; }

cd "$HERE"
"${WRANGLER[@]}" whoami >/dev/null

echo "deploy-spike: putting ROOM_KEY_SECRET (from stdin)"
printf '%s' "$secret" | "${WRANGLER[@]}" secret put ROOM_KEY_SECRET --config "$CONFIG"
unset secret

echo "deploy-spike: deploying $CONFIG"
# The first deploy (2026-10-02) uploaded the Worker but stopped applying the
# container application with a 401; the same deploy again finished it, as
# wrangler's own message advises. So one failure is retried once.
"${WRANGLER[@]}" deploy --config "$CONFIG" || {
	echo "deploy-spike: deploy failed; retrying once"
	"${WRANGLER[@]}" deploy --config "$CONFIG"
}

# A smoke read: an unknown room is a 404 ArtroomError from the Room's router.
code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/v1/rooms/deploy-spike-probe")
echo "deploy-spike: GET $URL/v1/rooms/deploy-spike-probe -> $code (404 expected)"
[[ $code == 404 ]]
