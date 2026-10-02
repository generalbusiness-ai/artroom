#!/bin/sh
# Tests scripts/check.sh: it passes on the spike, and fails when the compiler
# is missing or cannot run, on a configuration error, on a type error in the
# spike's own files, on a vendor diagnostic not in the known list, on a
# known one that no longer appears, and on a package that resolves outside
# the spike. Review f2212c63 found it passing all of the first six but the
# first; review 6d392973 found the last.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
check="$here/scripts/check.sh"
list="$here/scripts/vendor-diagnostics.txt"
scratch=$(mktemp -d)
trap 'rm -r "$scratch"' EXIT
failures=0
n=0

# expect <exit: pass|fail> <regular expression the output must match> <description> [VAR=value ...]
expect() {
  want=$1 text=$2 what=$3
  shift 3
  n=$((n + 1))
  out=$(env "$@" sh "$check" 2>&1)
  got=$?
  ok=1
  if [ "$want" = pass ] && [ "$got" -ne 0 ]; then ok=0; fi
  if [ "$want" = fail ] && [ "$got" -eq 0 ]; then ok=0; fi
  printf '%s\n' "$out" | grep -Eq -- "$text" || ok=0
  if [ "$ok" -eq 1 ]; then
    echo "ok $n - $what"
  else
    echo "not ok $n - $what (exit $got)"
    printf '%s\n' "$out" | sed 's/^/    /'
    failures=$((failures + 1))
  fi
}

grep -v '^#' "$list" | grep . | sed 1d > "$scratch/one-fewer.txt"
{ cat "$list"; echo "vendor/artroom/packages/client/src/room.ts(1,1): error TS9999"; } > "$scratch/one-more.txt"

expect pass "spike sources: no type errors" "the spike checks clean, with exactly the known vendor diagnostics"
expect fail "no TypeScript compiler" "a missing compiler fails" TSC="$scratch/no-such-tsc"
expect fail "the compiler failed" "a compiler that cannot run fails" TSC=/usr/bin/false
expect fail "checker-missing-compiler\.ts\(1,7\): error TS2322" "a type error in the spike's own files fails" CHECK_PROJECT=test/check/tsconfig.json
expect fail "error TS5083" "a configuration error fails" CHECK_PROJECT=test/check/tsconfig.broken.json
expect fail "not in the known list" "a vendor diagnostic not in the list fails" CHECK_ALLOWED="$scratch/one-fewer.txt"
expect fail "no longer appear" "a listed diagnostic that no longer appears fails" CHECK_ALLOWED="$scratch/one-more.txt"
# With the root workspaces installed, the unmapped subpath resolves to the root's package; without them, it does not resolve.
expect fail "packages/contract/src/policy\.ts|Cannot find module '@generalbusiness/artroom-contract/policy'" "an import that resolves outside the spike, or not at all, fails" CHECK_PROJECT=test/check/tsconfig.unpinned.json

echo "$((n - failures)) of $n passed"
[ "$failures" -eq 0 ]
