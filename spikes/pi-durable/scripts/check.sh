#!/bin/sh
# Type-checks the spike's own files. The vendored lane sources are checked in
# their own packages, with their own libs; under this Workers lib a few of
# their lines (DOM WebSocket handlers, a TextDecoder option) do not check, so
# errors in vendor/ are listed but do not fail this script.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
tsc="$here/node_modules/.bin/tsc"
[ -x "$tsc" ] || tsc="$here/../../node_modules/.bin/tsc"
# The Workers runtime types, generated as lane A does (ignored by git).
(cd "$here" && npx wrangler types --include-env=false src/worker-runtime.d.ts >/dev/null) || exit 1
out=$(cd "$here" && "$tsc" -p tsconfig.json 2>&1)
vendor=$(printf '%s\n' "$out" | grep -c '^vendor/.*error TS' || true)
own=$(printf '%s\n' "$out" | grep 'error TS' | grep -v '^vendor/' || true)
echo "type errors in vendored lane sources (not failing): $vendor"
if [ -n "$own" ]; then printf '%s\n' "$own"; exit 1; fi
echo "spike sources: no type errors"
