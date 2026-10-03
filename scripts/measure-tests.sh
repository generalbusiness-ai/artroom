#!/bin/bash
# Measure the cost of the complete gate, step by step: measure.sh <worktree> <outdir>
# For each step: elapsed seconds, and CPU seconds (user + system) summed over every process the step started.
W=$1; O=$2; mkdir -p $O; : > $O/steps.tsv
cd $W || exit 1
git rev-parse HEAD > $O/head.txt; git status --porcelain | wc -l | tr -d ' ' > $O/status-lines.txt
{ sysctl -n machdep.cpu.brand_string; sysctl -n hw.ncpu; node --version; uptime; } > $O/machine.txt 2>&1
step() { # name dir command...
  local name=$1 dir=$2; shift 2
  local l0=$(sysctl -n vm.loadavg | awk '{print $2}')
  ( cd $W/$dir && /usr/bin/time -p -o $O/$name.time "$@" > $O/$name.log 2>&1 ); local code=$?
  local real=$(awk '/^real/{print $2}' $O/$name.time) user=$(awk '/^user/{print $2}' $O/$name.time) sys=$(awk '/^sys/{print $2}' $O/$name.time)
  printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$name" "$code" "$real" "$user" "$sys" "$l0" >> $O/steps.tsv
}
V() { echo "--reporter=default --reporter=json --outputFile.json=$O/$1.json"; }
step ci . npm ci
step typecheck . npm run typecheck
step checkers packages/checkers npx vitest run --config vitest.config.ts $(V checkers)
step cli packages/cli npx vitest run $(V cli)
step client-node packages/client npx vitest run --config vitest.config.ts $(V client-node)
step client-workerd packages/client npx vitest run --config vitest.workers.config.ts $(V client-workerd)
step git packages/git npm test
step log-node packages/log npx vitest run --config vitest.config.ts $(V log-node)
step log-workerd packages/log npx vitest run --config vitest.workers.config.ts $(V log-workerd)
step mcp-node packages/mcp npx vitest run --config vitest.config.ts $(V mcp-node)
step mcp-workerd packages/mcp npx vitest run --config vitest.workers.config.ts $(V mcp-workerd)
step policy-node packages/policy npx vitest run --config vitest.config.ts $(V policy-node)
step policy-workerd packages/policy npx vitest run --config vitest.workers.config.ts $(V policy-workerd)
step room-node packages/room npx vitest run --config vitest.node.config.ts $(V room-node)
step room-workerd packages/room npx vitest run --config vitest.workers.config.ts $(V room-workerd)
step room-declared packages/room npx vitest run --config vitest.workers.declared.config.ts $(V room-declared)
step ui packages/ui npx vitest run $(V ui)
uptime >> $O/machine.txt
echo done > $O/done
