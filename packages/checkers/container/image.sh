#!/usr/bin/env bash
# The runner image: Node.js with git, for check runners only (never the
# publisher). Copies the official node:22-bookworm image (it includes git)
# into Cloudflare's registry without a Docker daemon. With Docker, point
# wrangler.jsonc at ./container/Dockerfile instead.
#
# Needs crane: GOBIN=$PWD/.bin go install github.com/google/go-containerregistry/cmd/crane@latest
# Prints the digest to put in wrangler.jsonc. Prints no credentials.
set -euo pipefail
ACCOUNT=6e953d231f1c9aadffbf59537a82e13a
SRC=docker.io/library/node:22-bookworm
DST=registry.cloudflare.com/$ACCOUNT/artroom-lg-runner:node22
CRANE=${CRANE:-crane}

export DOCKER_CONFIG=$(mktemp -d)
trap 'rm -r "$DOCKER_CONFIG"' EXIT
env -u CLOUDFLARE_API_TOKEN npx wrangler containers registries credentials registry.cloudflare.com \
	--push --pull --expiration-minutes 30 --json \
	| python3 -c 'import json,sys; print(json.load(sys.stdin)["password"], end="")' \
	| "$CRANE" auth login registry.cloudflare.com -u v1 --password-stdin >/dev/null
"$CRANE" copy --platform linux/amd64 "$SRC" "$DST"
echo "image: registry.cloudflare.com/$ACCOUNT/artroom-lg-runner@$("$CRANE" digest "$DST")"
