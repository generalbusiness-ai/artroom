#!/usr/bin/env bash
# Copy a public git image into the Cloudflare registry without a Docker daemon.
# Used because the build machine had no Docker. With Docker, set the image in
# wrangler.jsonc to { "dockerfile": "./Dockerfile" } and skip this script.
#
# Needs crane: GOBIN=$PWD/.bin go install github.com/google/go-containerregistry/cmd/crane@latest
# Prints the digest to put in wrangler.jsonc. Prints no credentials.
set -euo pipefail
ACCOUNT=6e953d231f1c9aadffbf59537a82e13a
SRC=docker.io/alpine/git:latest
DST=registry.cloudflare.com/$ACCOUNT/artroom-spike-git:alpine
CRANE=${CRANE:-crane}

export DOCKER_CONFIG=$(mktemp -d)
trap 'rm -r "$DOCKER_CONFIG"' EXIT
env -u CLOUDFLARE_API_TOKEN npx wrangler containers registries credentials registry.cloudflare.com \
	--push --pull --expiration-minutes 15 --json \
	| python3 -c 'import json,sys; print(json.load(sys.stdin)["password"], end="")' \
	| "$CRANE" auth login registry.cloudflare.com -u v1 --password-stdin >/dev/null
"$CRANE" copy --platform linux/amd64 "$SRC" "$DST"
echo "image: registry.cloudflare.com/$ACCOUNT/artroom-spike-git@$("$CRANE" digest "$DST")"
