#!/bin/sh
# Type-checks the spike with its own pinned compiler (`typescript` in
# package.json). It fails when the compiler is missing or cannot run, on a
# configuration error, on any diagnostic in the spike's own files, and on any
# diagnostic in vendor/ that is not listed in scripts/vendor-diagnostics.txt.
#
# The listed ones are the vendored lane sources' known diagnostics under this
# Workers lib (DOM WebSocket handlers, a TextDecoder option, two overloads),
# at the revisions in scripts/setup.sh. The vendored sources are checked in
# their own packages, with their own libs. A listed diagnostic that no longer
# appears also fails, so the list stays exact. This is a check of the spike's
# own files, not a clean whole-program check.
#
# For scripts/check-test.sh: TSC, CHECK_PROJECT and CHECK_ALLOWED replace the
# compiler, the project and the list.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
tsc=${TSC:-$here/node_modules/.bin/tsc}
project=${CHECK_PROJECT:-tsconfig.json}
allowed=${CHECK_ALLOWED:-$here/scripts/vendor-diagnostics.txt}
if [ ! -x "$tsc" ]; then
  echo "check: no TypeScript compiler at $tsc. Run npm ci in spikes/pi-durable." >&2
  exit 2
fi
if [ ! -f "$here/vendor/REVISIONS" ]; then
  echo "check: vendor/ is missing. Run sh scripts/setup.sh." >&2
  exit 2
fi
# The Workers runtime types, generated as lane A does (ignored by git).
(cd "$here" && npx wrangler types --include-env=false src/worker-runtime.d.ts >/dev/null) || exit 1

out=$(cd "$here" && "$tsc" -p "$project" --pretty false 2>&1)
status=$?
found=$(mktemp)
expected=$(mktemp)
unexpected=$(mktemp)
trap 'rm "$found" "$expected" "$unexpected"' EXIT
# One line per diagnostic: `path(line,col): error TSnnnn`, or `error TSnnnn` for one with no file.
printf '%s\n' "$out" | grep -E '^([^ ].*)?error TS[0-9]+' | sed -E 's/^(.*error TS[0-9]+).*/\1/' | sort -u > "$found"
grep -v '^#' "$allowed" | grep . | sort -u > "$expected"
if [ "$status" -ne 0 ] && [ ! -s "$found" ]; then
  printf '%s\n' "$out" >&2
  echo "check: the compiler failed (exit $status) without a diagnostic." >&2
  exit 1
fi
grep -Fxv -f "$expected" "$found" > "$unexpected"
missing=$(grep -Fxv -f "$found" "$expected")
echo "known diagnostics in vendored lane sources: $(grep -Fxc -f "$expected" "$found") of $(wc -l < "$expected" | tr -d ' ')"
fail=0
if [ -s "$unexpected" ]; then
  echo "check: diagnostics not in the known list:" >&2
  printf '%s\n' "$out" | grep -F -f "$unexpected" >&2
  fail=1
fi
if [ -n "$missing" ]; then
  echo "check: known diagnostics that no longer appear (update scripts/vendor-diagnostics.txt):" >&2
  printf '%s\n' "$missing" >&2
  fail=1
fi
[ "$fail" -eq 0 ] || exit 1
echo "spike sources: no type errors"
