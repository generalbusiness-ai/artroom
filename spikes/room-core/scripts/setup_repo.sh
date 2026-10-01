#!/usr/bin/env bash
# Creates the spike's test repo in the Artifacts namespace gitseq-spike:
# imports expressjs/express (about 214 files in 67 directories), then pushes
# two branches from its head: spike-small (one file changed) and spike-large
# (many files changed, added and deleted across directories).
# Writes results/repo.json with the three commit ids and the expected changed
# paths from local `git diff`, so the Worker's tree diff can be checked.
#
# Credentials: uses the wrangler OAuth token from the local config file.
# Tokens are held in shell variables only and never printed. Every repo token
# that this script sees is revoked at the end.
set -euo pipefail

ACCT=6e953d231f1c9aadffbf59537a82e13a
NS=gitseq-spike
REPO=${REPO:-artroom-spike-tree}
SRC=${SRC:-https://github.com/expressjs/express}
HERE=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
BASE="https://api.cloudflare.com/client/v4/accounts/$ACCT/artifacts/namespaces/$NS"
UA="artroom-spike/0.1"

redact() { sed -E 's/art_v[0-9]+_[A-Za-z0-9_]+(\?expires=[0-9]+)?/<token>/g'; }

env -u CLOUDFLARE_API_TOKEN npx -y wrangler@latest whoami >/dev/null 2>&1 || true
OAUTH=$(sed -n 's/^oauth_token = "\(.*\)"$/\1/p' ~/Library/Preferences/.wrangler/config/default.toml)
[ -n "$OAUTH" ] || { echo "no wrangler oauth token" >&2; exit 1; }

api() { # method path [json-body]
  if [ $# -ge 3 ]; then
    curl -sS -A "$UA" -X "$1" "$BASE$2" -H "Authorization: Bearer $OAUTH" -H "Content-Type: application/json" --data "$3"
  else
    curl -sS -A "$UA" -X "$1" "$BASE$2" -H "Authorization: Bearer $OAUTH"
  fi
}

existing=$(api GET "/repos/$REPO")
if [ "$(printf '%s' "$existing" | jq -r .success)" = "true" ]; then
  echo "repo $NS/$REPO exists; reusing it"
  out=$existing
else
echo "import $SRC into $NS/$REPO"
for attempt in 1 2 3 4 5 6; do
  out=$(api POST "/repos/$REPO/import" "{\"url\":\"$SRC\",\"depth\":1}")
  if [ "$(printf '%s' "$out" | jq -r .success)" = "true" ]; then break; fi
  echo "  attempt $attempt: $(printf '%s' "$out" | jq -c .errors | redact)"
  sleep $((attempt * 2))
done
fi
[ "$(printf '%s' "$out" | jq -r .success)" = "true" ] || exit 1
REMOTE=$(printf '%s' "$out" | jq -r .result.remote)

# A write token for the push; the import token is revoked below with the rest.
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  tok=$(api POST "/tokens" "{\"repo\":\"$REPO\",\"scope\":\"write\",\"ttl\":900}")
  if [ "$(printf '%s' "$tok" | jq -r .success)" = "true" ]; then break; fi
  echo "  token attempt $attempt: $(printf '%s' "$tok" | jq -c .errors | redact)"
  sleep 3
done
TOKEN=$(printf '%s' "$tok" | jq -r .result.plaintext)
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader GIT_CONFIG_VALUE_0="Authorization: Bearer $TOKEN" GIT_TERMINAL_PROMPT=0

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if git clone -q "$REMOTE" "$WORK/r" 2>&1 | redact; then [ -d "$WORK/r/.git" ] && break; fi
  sleep 3
done
cd "$WORK/r"
git config core.quotePath false
git config user.name "artroom spike"; git config user.email "spike@artroom.invalid"
BASE_SHA=$(git rev-parse HEAD)

# Small change: one file, five directories deep where possible.
SMALL_FILE=$(git ls-files | awk -F/ '{print NF, $0}' | sort -rn | head -1 | cut -d' ' -f2-)
git checkout -q -b spike-small "$BASE_SHA"
printf '\n// artroom spike: small change\n' >> "$SMALL_FILE"
git commit -qam "spike: small change"
SMALL_SHA=$(git rev-parse HEAD)

# Large change: modify every 3rd file, delete every 17th, add 20 files in a new nested directory.
git checkout -q -b spike-large "$BASE_SHA"
i=0
while IFS= read -r f; do
  i=$((i + 1))
  if [ $((i % 17)) -eq 0 ]; then git rm -q "$f"
  elif [ $((i % 3)) -eq 0 ]; then printf '\n// artroom spike: large change %d\n' "$i" >> "$f"
  fi
done < <(git ls-files)
for n in $(seq 1 20); do mkdir -p "spike/added/d$((n % 4))"; echo "added $n" > "spike/added/d$((n % 4))/f$n.txt"; done
git add -A; git commit -qm "spike: large change"
LARGE_SHA=$(git rev-parse HEAD)

for attempt in 1 2 3 4 5; do
  if git push -q -f origin spike-small spike-large 2>&1 | redact; then break; fi
  sleep 3
done

jq -n --arg repo "$REPO" --arg src "$SRC" --arg base "$BASE_SHA" --arg small "$SMALL_SHA" --arg large "$LARGE_SHA" \
  --argjson files "$(git ls-tree -r --name-only "$BASE_SHA" | wc -l)" \
  --argjson dirs "$(git ls-tree -r -d --name-only "$BASE_SHA" | wc -l)" \
  --argjson smallPaths "$(git diff --name-only "$BASE_SHA" "$SMALL_SHA" | jq -R . | jq -s .)" \
  --argjson largePaths "$(git diff --no-renames --name-only "$BASE_SHA" "$LARGE_SHA" | jq -R . | jq -s .)" \
  '{repo:$repo, source:$src, base:$base, small:$small, large:$large, files:$files, dirs:$dirs,
    expected:{small:$smallPaths, large:$largePaths}}' > "$HERE/results/repo.json"
echo "base=$BASE_SHA small=$SMALL_SHA large=$LARGE_SHA"
jq '{files, dirs, small: (.expected.small|length), large: (.expected.large|length)}' "$HERE/results/repo.json"

# Revoke every active token on the repo, including the import token.
ids=$(api GET "/repos/$REPO/tokens?state=active&per_page=100" | jq -r '.result[].id')
for id in $ids; do api DELETE "/tokens/$id" | jq -c '{revoked: .success}'; done
cd /; rm -r "$WORK"
