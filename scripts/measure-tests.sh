#!/bin/bash
# Measure what the tests cost, step by step: scripts/measure-tests.sh <output directory> [--serial]
#
# Each step is timed alone with /usr/bin/time: elapsed seconds, and CPU
# seconds (user and system) summed over every process the step started. Each
# vitest step also leaves its JSON report, from which the summed test-file
# time comes. steps.tsv has one line per step: name, exit code, elapsed,
# user, sys, and the one-minute load average when the step began.
#
# The first group times each package's suite on its own, as the baseline of
# request ecbc722a was taken (that baseline's step list is this script at
# commit ebbde3a0). The last step, `root-test`, is the one command the gate
# runs. State the machine, the load and whether node_modules was already
# installed with any figure you quote. The steps run one after another, so a
# sum of their times is a sum of separate runs, each with a warm file cache
# from the one before. For the elapsed time of one whole gate, time
# `npm run gate` itself.
#
# With --serial as the second argument, each suite runs with one worker and
# one file at a time, and the install, the typecheck and `root-test` are left
# out. A step's figure is then the elapsed time of the whole suite command
# with one worker: a serial comparison. It includes the runner's start and,
# in workerd, the pool and the runtime. It is not a worker's lifetime and not
# how the gate runs.
O=${1:?usage: scripts/measure-tests.sh <output directory> [--serial]}
SERIAL=""; [ "${2:-}" = "--serial" ] && SERIAL="--maxWorkers=1 --no-file-parallelism"
W=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$O"; O=$(cd "$O" && pwd); : > "$O/steps.tsv"
cd "$W" || exit 1
git rev-parse HEAD > "$O/head.txt"; git status --porcelain | wc -l | tr -d ' ' > "$O/status-lines.txt"
{ sysctl -n machdep.cpu.brand_string 2>/dev/null || grep -m1 "model name" /proc/cpuinfo; getconf _NPROCESSORS_ONLN; node --version; uptime; } > "$O/machine.txt" 2>&1
load() { uptime | sed 's/.*load average[s]*: *//' | cut -d' ' -f1 | tr -d ','; }
step() { # name dir command...
  local name=$1 dir=$2; shift 2
  local l0; l0=$(load)
  ( cd "$W/$dir" && /usr/bin/time -p -o "$O/$name.time" "$@" > "$O/$name.log" 2>&1 ); local code=$?
  printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$name" "$code" "$(awk '/^real/{print $2}' "$O/$name.time")" "$(awk '/^user/{print $2}' "$O/$name.time")" "$(awk '/^sys/{print $2}' "$O/$name.time")" "$l0" >> "$O/steps.tsv"
}
V() { echo "--reporter=default --reporter=json --outputFile.json=$O/$1.json $SERIAL"; }
[ -z "$SERIAL" ] && step ci . npm ci
[ -z "$SERIAL" ] && step typecheck . npm run typecheck
step checkers packages/checkers npx vitest run --config vitest.config.ts $(V checkers)
step cli packages/cli npx vitest run $(V cli)
step client-node packages/client npx vitest run --config vitest.config.ts $(V client-node)
step client-workerd packages/client npx vitest run --config vitest.workers.config.ts $(V client-workerd)
step git packages/git npm test
step log-node packages/log npx vitest run --config vitest.config.ts $(V log-node)
step log-workerd packages/log npx vitest run --config vitest.workers.config.ts $(V log-workerd)
step mcp-node packages/mcp npx vitest run --config vitest.config.ts $(V mcp-node)
step policy-node packages/policy npx vitest run --config vitest.config.ts $(V policy-node)
step policy-workerd packages/policy npx vitest run --config vitest.workers.config.ts $(V policy-workerd)
step room-node packages/room npx vitest run --config vitest.node.config.ts $(V room-node)
step room-workerd packages/room npx vitest run --config vitest.workers.config.ts $(V room-workerd)
step room-declared packages/room npx vitest run --config vitest.declared.config.ts $(V room-declared)
step ui packages/ui npx vitest run $(V ui)
[ -z "$SERIAL" ] && step root-test . npm test
uptime >> "$O/machine.txt"
echo done > "$O/done"
# `done` says the collection finished, not that the steps passed. A step that
# failed is named here and makes this script fail: its time is not a cost of
# a passing gate.
failed=$(awk -F'\t' '$2 != 0 {print $1 " (exit " $2 ")"}' "$O/steps.tsv")
if [ -n "$failed" ]; then
  echo "steps that failed:"; echo "$failed"
  exit 1
fi
echo "all $(wc -l < "$O/steps.tsv" | tr -d ' ') steps passed; figures in $O/steps.tsv"
