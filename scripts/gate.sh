#!/bin/bash
# The complete gate, run once at the head you will send for review:
# install (only if the lock file changed since the last install), typecheck, test.
# It prints the head, the tree and each step's cost, and exits non-zero if any step fails.
#
#   npm run gate            the gate
#   npm run gate -- --ci    the same, but always reinstalls with npm ci first
#
# docs/testing.md says when to run it and what to run while you work instead.
cd "$(dirname "$0")/.." || exit 2
force=${1:-}
out=$(mktemp -d)
lock=$(shasum -a 256 package-lock.json | cut -d' ' -f1)
stamp=node_modules/.artroom-lock-sha256
failed=0

step() { # name command...
  local name=$1; shift
  /usr/bin/time -p -o "$out/$name.time" "$@" > "$out/$name.log" 2>&1; local code=$?
  local real user sys
  real=$(awk '/^real/{print $2}' "$out/$name.time"); user=$(awk '/^user/{print $2}' "$out/$name.time"); sys=$(awk '/^sys/{print $2}' "$out/$name.time")
  printf "%-10s exit %s  elapsed %6.1f s  cpu %6.1f s\n" "$name" "$code" "$real" "$(echo "$user + $sys" | bc)"
  if [ "$code" != 0 ]; then failed=1; echo "--- last lines of $out/$name.log"; tail -40 "$out/$name.log"; fi
  return "$code"
}

echo "head $(git rev-parse HEAD)  tree $(git rev-parse 'HEAD^{tree}')  changed files $(git status --porcelain | wc -l | tr -d ' ')"
if [ "$force" = "--ci" ] || [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$lock" ]; then
  step install npm ci && echo "$lock" > "$stamp"
else
  echo "install    skipped: node_modules was installed from this package-lock.json"
fi
# Whitespace errors in what this branch changed, if the base is known.
# -B: a path that holds a new file, while the file it held at the base moved elsewhere unchanged, is read as a rewrite and a
# move. Without it the moved file is read as new, and its old lines are reported as this branch's.
base=$(git merge-base HEAD origin/main 2>/dev/null)
if [ -n "$base" ]; then step whitespace git diff --check -B "$base"; fi
[ "$failed" = 0 ] && step typecheck npm run typecheck
[ "$failed" = 0 ] && step test npm test
if [ "$failed" = 0 ]; then
  grep -h "Tests \|ℹ pass" "$out/test.log" | sed 's/^ */  /'
  echo "gate passed; logs in $out"
else
  echo "gate FAILED; logs in $out"
fi
exit "$failed"
