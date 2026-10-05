#!/usr/bin/env bash
# Deploy (or redeploy) the spike: the Room Worker, artroom-spike-room
# (wrangler.spike.jsonc), and lane G's checker service, artroom-spike-checkers
# (packages/checkers/wrangler.spike.jsonc), with hugh's wrangler OAuth login.
#
#   packages/room/scripts/deploy-spike.sh
#
# It reads ROOM_KEY_SECRET and ARTROOM_CHECKER_SEED from
# ~/.config/generalbusiness/artroom-spike.env (or $ARTROOM_SPIKE_ENV) and puts
# ROOM_KEY_SECRET and CHECKER_KEY (the seed's private JWK, made by
# spike-checker-key.mjs) with `wrangler secret put` on stdin. It never prints,
# logs or writes a secret. The same values on every run keep existing rooms'
# keys, repository identities and checker membership stable.
#
# The two Workers bind each other (the Room's CHECKER_<NAME> services, the
# checker's ROOM service), and a service binding needs its target to exist.
# So: put both secrets first (`secret put` creates a Worker that does not
# exist yet), deploy the checker service (its ROOM target exists), then the
# Room (its CHECKER_<NAME> targets exist, with their entrypoints).
set -euo pipefail

ENV_FILE=${ARTROOM_SPIKE_ENV:-$HOME/.config/generalbusiness/artroom-spike.env}
HERE=$(cd "$(dirname "$0")/.." && pwd)
CONFIG=$HERE/wrangler.spike.jsonc
CHECKERS_CONFIG=$HERE/../checkers/wrangler.spike.jsonc
URL=https://artroom-spike-room.inguz.workers.dev
# The wrangler that package-lock.json pins for this package, installed by
# `npm ci`. `--no-install` stops npx from fetching any other version.
WRANGLER=(env -u CLOUDFLARE_API_TOKEN npx --no-install wrangler)

[[ -f $ENV_FILE ]] || { echo "deploy-spike: $ENV_FILE is missing" >&2; exit 2; }
mode=$(stat -f %Lp "$ENV_FILE" 2>/dev/null || stat -c %a "$ENV_FILE")
[[ $mode == 600 ]] || { echo "deploy-spike: $ENV_FILE must be mode 600 (it is $mode)" >&2; exit 2; }

# The value only; the file is not sourced, so nothing else in it runs or is exported.
secret=$(sed -nE 's/^ROOM_KEY_SECRET=["'\'']?([^"'\'']*)["'\'']?$/\1/p' "$ENV_FILE")
[[ -n $secret ]] || { echo "deploy-spike: ROOM_KEY_SECRET is not set in $ENV_FILE" >&2; exit 2; }
# The checker's key ID (public); fails if ARTROOM_CHECKER_SEED is missing or malformed.
checker_key=$(ARTROOM_SPIKE_ENV=$ENV_FILE node "$HERE/scripts/spike-checker-key.mjs" id)
echo "deploy-spike: checker key $checker_key"

cd "$HERE"
"${WRANGLER[@]}" whoami >/dev/null

echo "deploy-spike: putting ROOM_KEY_SECRET (from stdin)"
printf '%s' "$secret" | "${WRANGLER[@]}" secret put ROOM_KEY_SECRET --config "$CONFIG"
unset secret

echo "deploy-spike: putting CHECKER_KEY (from stdin)"
ARTROOM_SPIKE_ENV=$ENV_FILE node "$HERE/scripts/spike-checker-key.mjs" jwk | "${WRANGLER[@]}" secret put CHECKER_KEY --config "$CHECKERS_CONFIG"

echo "deploy-spike: deploying $CHECKERS_CONFIG"
"${WRANGLER[@]}" deploy --config "$CHECKERS_CONFIG" || {
	echo "deploy-spike: deploy failed; retrying once"
	"${WRANGLER[@]}" deploy --config "$CHECKERS_CONFIG"
}

echo "deploy-spike: deploying $CONFIG"
# The first deploy (2026-10-02) uploaded the Worker but stopped applying the
# container application with a 401; the same deploy again finished it, as
# wrangler's own message advises. So one failure is retried once.
# PIN_DELAY_MS (request 8bd623cc; hugh's approval, assert 66a41558) is a
# measurement step only: set it in this script's environment to deploy the
# Room with the pin left to the alarm, then run this script again without it
# to unset it. No config file sets it, and production never has it.
room_vars=()
if [[ -n ${PIN_DELAY_MS:-} ]]; then
	[[ $PIN_DELAY_MS =~ ^[0-9]+$ ]] || { echo "deploy-spike: PIN_DELAY_MS must be a whole number of milliseconds" >&2; exit 2; }
	echo "deploy-spike: MEASUREMENT: deploying the Room with PIN_DELAY_MS=$PIN_DELAY_MS; redeploy without it after the window"
	room_vars=(--var "PIN_DELAY_MS:$PIN_DELAY_MS")
else
	echo "deploy-spike: PIN_DELAY_MS is not set (the default)"
fi
"${WRANGLER[@]}" deploy --config "$CONFIG" ${room_vars[@]+"${room_vars[@]}"} || {
	echo "deploy-spike: deploy failed; retrying once"
	"${WRANGLER[@]}" deploy --config "$CONFIG" ${room_vars[@]+"${room_vars[@]}"}
}

# A smoke read: an unknown room is a 404 ArtroomError from the Room's router.
code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/v1/rooms/deploy-spike-probe")
echo "deploy-spike: GET $URL/v1/rooms/deploy-spike-probe -> $code (404 expected)"
[[ $code == 404 ]]
