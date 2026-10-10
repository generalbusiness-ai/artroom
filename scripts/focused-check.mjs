#!/usr/bin/env node
// One reviewed compiler/body plan. Built-ins only until every source/tool fence passes.
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const self = fileURLToPath(import.meta.url);
const sha = (path) => {
  const hash = createHash("sha256"), buffer = Buffer.alloc(64 * 1024), fd = openSync(path, "r");
  try { for (let bytes; (bytes = readSync(fd, buffer, 0, buffer.length, null)) > 0;) hash.update(buffer.subarray(0, bytes)); }
  finally { closeSync(fd); }
  return hash.digest("hex");
};
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const requireFact = (condition, message) => { if (!condition) throw new Error(message); };
const inside = (root, path) => { const r = relative(root, path); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
const key = (row) => JSON.stringify([row.project, row.file, row.name]);
const sameSet = (actual, expected) => actual.length === expected.length && new Set(actual).size === actual.length && actual.every(x => expected.includes(x));
const expectedCases = (plan) => plan.body.selection.flatMap(file => file.cases.map(name => ({ project: file.project, file: resolve(plan.root, file.path), name })));

function guard(plan) {
  const entered = performance.now();
  const root = realpathSync(plan.root);
  requireFact(root === plan.root && /^[a-f0-9]{40}$/.test(plan.head) && /^[a-f0-9]{40}$/.test(plan.tree), "Invalid canonical source identity");
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  requireFact(git("rev-parse", "HEAD") === plan.head && git("rev-parse", "HEAD^{tree}") === plan.tree && git("status", "--porcelain") === "", "Source identity changed or checkout is dirty");
  const sources = new Map();
  for (const file of plan.sources) {
    const path = realpathSync(resolve(root, file.path));
    requireFact(inside(root, path) && !sources.has(path) && sha(path) === file.sha256, "Frozen source/config bytes changed");
    sources.set(path, file.sha256);
  }
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const activeInputs = tracked.filter(path => /^(packages|scripts|examples)\//.test(path) || /^(package(-lock)?\.json|tsconfig.*\.json|vitest\.config\.ts)$/.test(path));
  requireFact(activeInputs.every(path => sources.has(realpathSync(resolve(root, path)))), "The active source/configuration/fixture inventory is incomplete");
  const inputs = new Map();
  for (const file of plan.inputs) {
    const path = realpathSync(file.path);
    requireFact(!inputs.has(path) && sha(path) === file.sha256, "Frozen external input changed");
    inputs.set(path, file.sha256);
  }
  requireFact(sources.has(realpathSync(self)) || inputs.has(realpathSync(self)), "The actual pipeline/reporter must be frozen in the plan");
  const pinned = path => sources.has(realpathSync(path)) || inputs.has(realpathSync(path));
  for (const tool of [plan.node, plan.tsc, plan.vitest, ...plan.tools]) requireFact(realpathSync(tool.path) === tool.path && sha(tool.path) === tool.sha256, "Reviewed tool bytes or path changed");
  const vitestPackage = resolve(dirname(plan.vitest.path), "package.json");
  requireFact(plan.tools.some(t => t.path === vitestPackage) && json(vitestPackage).version === "4.1.11", "The reviewed Vitest reporter API version must be pinned");
  requireFact(sha(resolve(root, "package-lock.json")) === plan.lock_sha256 && readFileSync(resolve(root, "node_modules/.artroom-lock-sha256"), "utf8").trim() === plan.lock_sha256, "Existing-lock dependency view is missing or changed");
  const actualPackages = readdirSync(resolve(root, "packages")).filter(name => existsSync(resolve(root, "packages", name, "package.json"))).map(name => {
    const directory = realpathSync(resolve(root, "packages", name));
    return { ...json(resolve(directory, "package.json")), directory };
  });
  requireFact(sameSet(plan.workspaces.map(w => w.name), actualPackages.map(w => w.name)), "The complete current workspace set is required");
  const actualAliases = [];
  for (const workspace of plan.workspaces) {
    const actual = actualPackages.find(w => w.name === workspace.name);
    requireFact(workspace.directory === actual.directory && realpathSync(resolve(root, "node_modules", workspace.name)) === actual.directory && sha(resolve(actual.directory, "package.json")) === workspace.package_json_sha256, "Workspace dependency resolves outside frozen current source");
    for (const [sub, target] of Object.entries(actual.exports ?? {})) if (typeof target === "string") {
      const path = realpathSync(resolve(actual.directory, target));
      requireFact(sources.has(path), "Every workspace export must be source-pinned");
      actualAliases.push(JSON.stringify([actual.name + (sub === "." ? "" : sub.slice(1)), path]));
    }
  }
  requireFact(sameSet(plan.aliases.map(a => JSON.stringify([a.find, realpathSync(a.replacement)])), actualAliases), "Current source export aliases differ from the complete plan");
  const compilers = new Set();
  const labels = new Set();
  for (const compiler of plan.compilers) {
    requireFact(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(compiler.name) && !["body", "error"].includes(compiler.name) && !labels.has(compiler.name), "Invalid or duplicate compiler label");
    const path = realpathSync(resolve(root, compiler.config)), cwd = realpathSync(resolve(root, compiler.cwd));
    requireFact(inside(root, path) && inside(root, cwd) && sources.has(path) && !compilers.has(path), "Compiler roots must be pinned and declared once");
    compilers.add(path);
    labels.add(compiler.name);
  }
  requireFact(inside(root, realpathSync(resolve(root, plan.body.cwd))) && pinned(resolve(root, plan.body.config)), "Body cwd/config is outside the reviewed plan");
  const selections = plan.body.selection.map(file => {
    const path = realpathSync(resolve(root, file.path));
    requireFact(inside(root, path) && sources.has(path) && typeof file.project === "string" && typeof file.pool === "string" && file.cases.length > 0 && file.cases.every(name => typeof name === "string" && name.length > 0), "Invalid complete-file case ledger");
    return JSON.stringify([file.project, path]);
  });
  requireFact(selections.length > 0 && new Set(selections).size === selections.length && new Set(expectedCases(plan).map(key)).size === expectedCases(plan).length, "Duplicate or empty required selection");
  return { head: plan.head, tree: plan.tree, clean: true, sources: sources.size, inputs: inputs.size, workspaces: plan.workspaces.length, aliases: actualAliases.length, milliseconds: performance.now() - entered };
}

// Public Vitest 4 Reporter APIs preserve real project identity, missing from its JSON reporter.
export default class FocusedReporter {
  onInit(ctx) {
    this.ctx = ctx;
    this.plan = json(process.env.ARTROOM_FOCUSED_PLAN);
    this.output = realpathSync(process.env.ARTROOM_FOCUSED_OUTPUT);
  }
  emit(event) { appendFileSync(resolve(this.output, "coverage.jsonl"), JSON.stringify(event) + "\n", { mode: 0o600 }); }
  onTestRunStart(specs) {
    const expected = this.plan.body.selection.map(f => JSON.stringify([f.project, resolve(this.plan.root, f.path), f.pool]));
    const actual = specs.map(s => JSON.stringify([s.project.name, s.moduleId, s.pool]));
    const c = this.ctx.config;
    const filtered = (c.shard && (c.shard.index !== 1 || c.shard.count !== 1)) || c.project?.length || c.testNamePattern || c.tagsFilter || specs.some(s => s.testLines?.length || s.testIds?.length || s.testNamePattern || s.testTagsFilter || (s.project.config.retry ?? 0) !== 0);
    this.emit({ event: "selection", actual, expected, accepted: !filtered && sameSet(actual, expected) });
    requireFact(!filtered && sameSet(actual, expected), "Focused whole-file/project/pool selection refused before global setup or test bodies");
  }
  row(test) {
    const diagnostic = test.diagnostic();
    return { project: test.project.name, file: test.module.moduleId, name: test.fullName, status: test.result().state, errors: test.result().errors?.length ?? 0, retryCount: diagnostic?.retryCount ?? 0, repeatCount: diagnostic?.repeatCount ?? 0 };
  }
  onTestModuleCollected(module) { this.emit({ event: "collected", project: module.project.name, file: module.moduleId, cases: [...module.children.allTests()].map(test => this.row(test)) }); }
  onTestCaseReady(test) { this.emit({ event: "started", ...this.row(test) }); }
  onTestCaseResult(test) { this.emit({ event: "result", ...this.row(test) }); }
  onTestRunEnd(modules, errors, reason) {
    this.emit({ event: "end", reason, unhandledErrors: errors.length, modules: modules.map(module => ({ project: module.project.name, file: module.moduleId, status: module.state(), errors: module.errors().length, cases: [...module.children.allTests()].map(test => this.row(test)) })) });
  }
}

function coverage(plan, output, body) {
  const events = [], issues = [];
  const progress = resolve(output, "coverage.jsonl");
  if (existsSync(progress)) for (const line of readFileSync(progress, "utf8").split("\n").filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      requireFact(event && typeof event === "object" && typeof event.event === "string", "Invalid structured event");
      events.push(event);
    } catch { issues.push("incomplete or invalid structured event"); }
  }
  const validCase = c => c && typeof c.project === "string" && typeof c.file === "string" && typeof c.name === "string" && ["passed", "failed", "skipped", "pending"].includes(c.status) && Number.isSafeInteger(c.errors) && Number.isSafeInteger(c.retryCount) && Number.isSafeInteger(c.repeatCount);
  const ends = events.filter(e => e.event === "end" && Array.isArray(e.modules) && e.modules.every(m => Array.isArray(m.cases) && m.cases.every(validCase)));
  const selections = events.filter(e => e.event === "selection");
  const results = events.filter(e => e.event === "result" && validCase(e)), started = new Set(events.filter(e => e.event === "started" && validCase(e)).map(key));
  const rows = ends.length === 1 ? ends[0].modules.flatMap(m => m.cases) : results;
  const expected = expectedCases(plan);
  const cases = expected.map(want => {
    const matches = rows.filter(row => key(row) === key(want));
    const status = matches.length === 1 ? matches[0].status : matches.length ? "duplicate" : "unrun";
    return { ...want, status: status === "pending" ? started.has(key(want)) ? "unfinished" : "unrun" : status, started: started.has(key(want)), observed: matches };
  });
  if (body) {
    if (body.wallSeconds === null || body.cpuSeconds === null) issues.push("command timing unavailable");
    if (selections.length !== 1 || selections[0].accepted !== true) issues.push("selection missing or refused");
    if (ends.length !== 1 || ends[0].reason !== "passed" || ends[0].unhandledErrors !== 0) issues.push("run incomplete, interrupted or has unhandled errors");
    if (!sameSet(rows.map(key), expected.map(key))) issues.push("missing, added or duplicate cases");
    if (new Set(results.map(key)).size !== results.length) issues.push("duplicate case completion events");
    if (ends.some(e => e.modules.some(m => m.status !== "passed" || m.errors !== 0))) issues.push("file failed, skipped, incomplete or has collection errors");
    if (cases.some(c => c.status !== "passed" || c.observed.some(r => r.errors !== 0 || r.retryCount !== 0 || r.repeatCount !== 0))) issues.push("required case did not pass exactly once");
    try {
      requireFact(statSync(resolve(output, "vitest.json")).size <= 32 * 1024 * 1024, "Built-in JSON is oversized; retain it without parsing payloads");
      const report = json(resolve(output, "vitest.json"));
      if (report.success !== true || report.numTotalTests !== expected.length || report.numPassedTests !== expected.length || report.numFailedTests !== 0 || report.numPendingTests !== 0 || report.numTodoTests !== 0 || report.numFailedTestSuites !== 0 || report.numPendingTestSuites !== 0 || report.testResults.some(f => f.status !== "passed") || report.testResults.length !== plan.body.selection.length) issues.push("built-in JSON count/file/status mismatch");
    } catch { issues.push("built-in JSON report missing or invalid"); }
  }
  return { cases, observedCases: rows, unexpectedCases: rows.filter(row => !expected.some(want => key(want) === key(row))), modules: ends.flatMap(e => e.modules.map(({ cases: _, ...module }) => module)), issues, passed: body !== null && issues.length === 0 && body.exitCode === 0 && body.signal === null };
}

function execute(name, executable, args, cwd, output, env) {
  const log = resolve(output, name + ".log");
  // spawnSync's file-backed output retains complete logs without buffering or printing payloads.
  const fd = openSync(log, "wx", 0o600);
  const start = performance.now(), started = new Date().toISOString();
  console.log(`Focused phase ${name} started.`);
  // The time process closes the log with its own anchored numeric triplet.
  let result;
  try { result = spawnSync("/usr/bin/time", ["-p", executable, ...args], { cwd, env, stdio: ["ignore", fd, fd] }); }
  finally { closeSync(fd); }
  // Inspect only the bounded log tail, never scan a generated comparison body for status.
  const tail = Buffer.alloc(Math.min(statSync(log).size, 8192)), reader = openSync(log, "r");
  try { readSync(reader, tail, 0, tail.length, statSync(log).size - tail.length); } finally { closeSync(reader); }
  const timing = /(?:^|\n)real\s+([\d.]+)\nuser\s+([\d.]+)\nsys\s+([\d.]+)\s*$/.exec(tail.toString());
  console.log(`Focused phase ${name} finished; exit ${result.status ?? "none"}; signal ${result.signal ?? "none"}.`);
  return { name, command: [executable, ...args], cwd, started, ended: new Date().toISOString(), measuredCommandMilliseconds: performance.now() - start, exitCode: result.status, signal: result.signal, spawnError: result.error?.code ?? null, wallSeconds: timing ? Number(timing[1]) : null, userSeconds: timing ? Number(timing[2]) : null, systemSeconds: timing ? Number(timing[3]) : null, cpuSeconds: timing ? Number(timing[2]) + Number(timing[3]) : null };
}

async function main() {
  if (process.argv.length !== 4) { console.error("usage: node scripts/focused-check.mjs <reviewed-plan.json> <new-external-output-directory>"); return 2; }
  const output = resolve(process.argv[3]);
  let plan, body = null, code = 2;
  const entered = performance.now(), result = { phases: [], guards: [], status: "refused", stage: "plan" };
  let snapshotHash;
  const check = () => {
    result.stage = "source-tool-dependency-guard";
    requireFact(sha(resolve(output, "plan.json")) === snapshotHash, "The reviewed execution plan changed");
    result.guards.push(guard(plan));
  };
  requireFact(!existsSync(output), "Evidence directory already exists; refusing overwrite or retry");
  plan = json(resolve(process.argv[2]));
  requireFact(!inside(realpathSync(plan.root), resolve(realpathSync(dirname(output)), basename(output))), "Evidence must be outside the checkout");
  mkdirSync(output, { mode: 0o700 });
  try {
    save(resolve(output, "plan.json"), plan);
    snapshotHash = sha(resolve(output, "plan.json"));
    chmodSync(resolve(output, "plan.json"), 0o400);
    check();
    const env = { ...process.env, ARTROOM_FOCUSED_PLAN: resolve(output, "plan.json"), ARTROOM_FOCUSED_OUTPUT: output };
    for (const [index, compiler] of plan.compilers.entries()) {
      // One fence at each command boundary; the next entry also checks the prior exit.
      if (index > 0) check();
      result.stage = "compiler:" + compiler.name;
      const phase = execute(compiler.name, plan.node.path, [plan.tsc.path, "-p", resolve(plan.root, compiler.config)], resolve(plan.root, compiler.cwd), output, env);
      result.phases.push(phase);
      code = phase.exitCode === 0 ? 2 : phase.exitCode ?? 1;
      if (phase.exitCode !== 0 || phase.signal !== null) {
        check();
        code = phase.exitCode || 1;
        throw new Error("Compiler failed; remaining commands unrun");
      }
      requireFact(phase.wallSeconds !== null && phase.cpuSeconds !== null, "Compiler timing unavailable; later commands unrun");
    }
    if (plan.compilers.length > 0) check();
    result.stage = "body";
    body = execute("body", plan.node.path, [plan.vitest.path, "run", ...new Set(plan.body.selection.map(f => resolve(plan.root, f.path))), "--config", resolve(plan.root, plan.body.config), "--bail=1", "--allowOnly=false", "--passWithNoTests=false", "--reporter=verbose", "--reporter=json", "--reporter=" + self, "--outputFile.json=" + resolve(output, "vitest.json")], resolve(plan.root, plan.body.cwd), output, env);
    result.phases.push(body);
    code = body.exitCode || 1;
    check();
    result.stage = "coverage";
    const verified = coverage(plan, output, body);
    save(resolve(output, "coverage-ledger.json"), verified);
    code = body.exitCode || (verified.passed ? 0 : 1);
    result.status = code === 0 ? "passed" : "failed";
    if (code === 0) result.stage = "complete";
  } catch (error) {
    result.status = result.phases.length ? "failed" : "refused";
    writeFileSync(resolve(output, "error.log"), error.stack + "\n", { flag: "wx", mode: 0o600 });
    if (Array.isArray(plan?.body?.selection) && plan.body.selection.every(f => Array.isArray(f.cases)) && !existsSync(resolve(output, "coverage-ledger.json"))) save(resolve(output, "coverage-ledger.json"), coverage(plan, output, body));
  } finally {
    result.verificationExitCode = code;
    result.commandLedger = [...(Array.isArray(plan?.compilers) ? plan.compilers : []).map(c => c.name), "body"].map(name => {
      const phase = result.phases.find(p => p.name === name);
      return { name, status: phase ? phase.exitCode === 0 && phase.signal === null ? "passed" : "failed" : "unrun", phase: phase ?? null };
    });
    result.elapsedToResultPreparationMilliseconds = performance.now() - entered;
    result.timingNote = "Per-command wall/CPU observations are separate. Time the outer pipeline to measure all guard/artifact/driver CPU; internal elapsed excludes Node bootstrap.";
    try {
      const { status, ...verification } = result;
      save(resolve(output, "result.json"), { ...verification, verificationStatus: status });
      const files = Object.fromEntries(readdirSync(output).map(name => [name, { sha256: sha(resolve(output, name)) }]));
      save(resolve(output, "manifest.json"), { files, verificationExitCode: code, completionRule: "Actual pipeline exit is authoritative; a sealing failure is not a complete run." });
      for (const name of readdirSync(output)) chmodSync(resolve(output, name), 0o400);
      chmodSync(output, 0o500);
    } catch (error) {
      code = 2;
      result.status = "evidence-failed";
      // A fresh sibling records sealing failure without changing any earlier evidence.
      try { save(output + ".seal-failure.json", { pipelineExitCode: 2, verificationExitCode: result.verificationExitCode, error: error.code ?? "seal-failed", evidence: output }); } catch { /* Existing files remain untouched. */ }
      console.error("Evidence sealing failed; verification artifacts remain partial; pipeline exit 2.");
    }
  }
  console.log(`Focused checks ${result.status}; exit ${code}; evidence ${output}`);
  return code;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self)) {
  main().then(code => { process.exitCode = code; }).catch(() => { console.error("Focused pipeline could not complete evidence (exit 2); existing files were not overwritten."); process.exitCode = 2; });
}
