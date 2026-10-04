#!/usr/bin/env bash
# A live round trip against Artifacts: create a repository in the
# gitseq-spike namespace, mint a short write token, publish three log
# commits to refs/artroom/log and verify them from a fresh clone, then
# revoke every token on the repository and delete it.
#
# Credentials come from the wrangler OAuth login. Tokens stay in shell
# variables and the git environment; nothing printed contains one.
set -euo pipefail

ACCT=6e953d231f1c9aadffbf59537a82e13a
NS=gitseq-spike
REPO=${REPO:-artroom-log-live-$(date +%m%d%H%M%S)}
BASE="https://api.cloudflare.com/client/v4/accounts/$ACCT/artifacts/namespaces/$NS"
UA="artroom-log/0.1"
HERE=$(cd "$(dirname "$0")/.." && pwd)

redact() { sed -E 's/art_v[0-9]+_[A-Za-z0-9_]+(\?expires=[0-9]+)?/<token>/g'; }

env -u CLOUDFLARE_API_TOKEN npx -y wrangler@latest whoami >/dev/null 2>&1 || true
OAUTH=$(sed -n 's/^oauth_token = "\(.*\)"$/\1/p' ~/Library/Preferences/.wrangler/config/default.toml)
[ -n "$OAUTH" ] || { echo "no wrangler oauth token" >&2; exit 1; }

api() { # method path [json-body]; retries Artifacts error 10400
  local out
  for attempt in 1 2 3 4 5 6; do
    if [ $# -ge 3 ]; then
      out=$(curl -sS -A "$UA" -X "$1" "$BASE$2" -H "Authorization: Bearer $OAUTH" -H "Content-Type: application/json" --data "$3")
    else
      out=$(curl -sS -A "$UA" -X "$1" "$BASE$2" -H "Authorization: Bearer $OAUTH")
    fi
    if printf '%s' "$out" | grep -q '"code":10400'; then sleep $((attempt * 2)); continue; fi
    break
  done
  printf '%s' "$out"
}

cleanup() {
  ids=$(api GET "/repos/$REPO/tokens?state=active&per_page=100" | jq -r '.result[]?.id')
  for id in $ids; do api DELETE "/tokens/$id" | jq -c '{revokedToken: .success}'; done
  api DELETE "/repos/$REPO" | jq -c '{deletedRepo: .success}'
}
trap cleanup EXIT

created=$(api POST "/repos" "{\"name\":\"$REPO\",\"default_branch\":\"main\"}")
[ "$(printf '%s' "$created" | jq -r .success)" = "true" ] || { printf '%s\n' "$created" | redact >&2; exit 1; }
REMOTE=$(printf '%s' "$created" | jq -r .result.remote)
echo "created $NS/$REPO"

tok=$(api POST "/tokens" "{\"repo\":\"$REPO\",\"scope\":\"write\",\"ttl\":900}")
[ "$(printf '%s' "$tok" | jq -r .success)" = "true" ] || { printf '%s\n' "$tok" | jq -c .errors | redact >&2; exit 1; }
TOKEN=$(printf '%s' "$tok" | jq -r .result.plaintext)
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader GIT_CONFIG_VALUE_0="Authorization: Bearer $TOKEN" GIT_TERMINAL_PROMPT=0

node "$HERE/scripts/live-roundtrip.ts" "$REMOTE" 2>&1 | redact
node "$HERE/src/cli.ts" verify "$REMOTE" 2>&1 | redact
