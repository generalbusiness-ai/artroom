// Print Markdown tables from a driver result file.
//   node scripts/summarize.mjs results/deployed.json
import { readFileSync } from "node:fs";

const r = JSON.parse(readFileSync(process.argv[2], "utf8"));
const f = (x, d = 2) => (x === undefined || x === null ? "–" : Number(x).toFixed(d));
const row = (cells) => console.log(`| ${cells.join(" | ")} |`);
const head = (cells) => { row(cells); row(cells.map(() => "---")); };

console.log(`# ${r.base}  runs=${r.runs}  ${r.started}\n`);
if (r.first) console.log(`First calls to a new room: setup ${f(r.first.setupRoundTrip, 0)} ms, first claim ${f(r.first.claimRoundTrip, 0)} ms\n`);
if (r.checks) console.log(`Checks: ${JSON.stringify(r.checks)}\n`);

if (r.acts) {
  console.log("## Act round trip from the driver (ms)\n");
  head(["act", "n", "p50", "p90", "max", "in DO p50"]);
  for (const [k, v] of Object.entries(r.acts.roundTrip)) row([k, v.n, f(v.p50, 1), f(v.p90, 1), f(v.max, 1), f(r.acts.inDurableObject[k].p50, 1)]);
  const a = r.acts.roundTripAll;
  row(["all", a.n, f(a.p50, 1), f(a.p90, 1), f(a.max, 1), ""]);
  console.log("\nParts (DO timers):", JSON.stringify(r.acts.parts), "\nRules per act (DO timers):", JSON.stringify(r.acts.rulesPerAct), "\n");
}

if (r.diff) {
  console.log("## Tree diff in the DO (ms)\n");
  head(["case", "paths", "readTree calls", "get p50", "readCommit p50", "readTree call p50", "diff p50", "diff p90", "diff max", "round trip p50"]);
  for (const [k, v] of Object.entries(r.diff))
    row([k, v.paths, `${v.readTreesFirst} first, ${v.readTrees} last`, f(v.get_ms.p50, 0), f(v.commit_ms?.p50, 0), f(v.tree_call_p50?.p50, 0), f(v.diff_ms.p50, 0), f(v.diff_ms.p90, 0), f(v.diff_ms.max, 0), f(v.roundTrip.p50, 0)]);
  console.log();
}

if (r.bench) {
  const b = r.bench;
  console.log(`Rule outputs agree across guard modes and with the recorded output: ${b.outputsAgreeAcrossModes}\n`);
  console.log(`## CPU per operation (ms). No-op RPC p50 ${f(b.noopCall.p50, 1)} ms\n`);
  head(["operation", "steps", "in-DO p50", "in-DO p90", "in-DO max", "wall-derived p50", "wall-derived p90"]);
  const line = (name, steps, x) => row([name, steps ?? "", f(x.perOpInDO.p50, 3), f(x.perOpInDO.p90, 3), f(x.perOpInDO.max, 3), f(x.perOpWall.p50, 3), f(x.perOpWall.p90, 3)]);
  line("verify (import key + verify)", "", b.verify);
  line("compile all 12 rules", "", b.compileAllRules);
  for (const [id, x] of Object.entries(b.rules)) {
    line(`${x.kind}: ${id} (full guard)`, x.steps, x.guarded);
    if (x.memo) line(`${x.kind}: ${id} (full guard, memo)`, x.steps, x.memo);
    line(`${x.kind}: ${id} (steps only)`, x.steps, x.stepsOnly);
    line(`${x.kind}: ${id} (no guard)`, x.steps, x.unguarded);
  }
  console.log("\n## Pathological rules\n");
  head(["rule", "size", "guard", "jsonata timeout", "worker ms", "in-DO ms", "steps", "outcome"]);
  for (const p of b.patho)
    row([p.rule ?? "cubic filter", p.size ?? "", String(p.guard), p.timeoutMs ?? "", p.workerMs ?? "", p.inDO ?? "", p.steps ?? "", p.failed ? `request failed: ${p.failed}` : p.error ?? `ok ${p.value ?? ""}`]);
}
