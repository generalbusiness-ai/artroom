#!/usr/bin/env node
// Show that a test tells a wrong behaviour from the right one: apply one small
// change to a source file, run the named tests, and put the file back.
//
//   node scripts/control.mjs <source file> <old text> <new text> [--expect <part of a test name>] -- <package dir> <test args...>
//
// Example:
//   node scripts/control.mjs packages/derive/src/reserve.ts \
//     'entries === 0 && head.type === "checkpoint"' 'entries === 0' --expect 'closing checkpoint' \
//     -- packages/scope test/turn.test.ts
//
// The test args go to vitest, or to `node --test` in a package whose test
// script uses Node's runner. The change must occur exactly once in the file.
// The file is restored even if the run is interrupted.
//
// The tests are run twice: first unchanged, which must pass, and then with
// the change. There are three results, and only the first is evidence:
//
//   exit 0  distinguishes   a test failed by an assertion with the change applied
//   exit 1  survives        every test still passed with the change applied
//   exit 2  inconclusive    nothing was shown: the tests did not start, did not
//                           pass before the change, did not load or compile
//                           with it, ran fewer tests than before, had any
//                           timeout, or failed only by a thrown error; or the
//                           test named by --expect did not fail
//
// The failed tests and the first line of each failure are printed. Read them:
// the assertion should be the one that states the invariant. This is for one
// change at a time, by hand. It is not a mutation sweep, and docs/testing.md
// says why there is none.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const USAGE = "usage: node scripts/control.mjs <source file> <old text> <new text> [--expect <part of a test name>] -- <package dir> <test args...>";
const TIMEOUT_MS = 10 * 60 * 1000;

function inconclusive(why) {
  console.error(`\nINCONCLUSIVE: ${why}\nNothing is shown about the tests.`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const split = argv.indexOf("--");
const before = split < 0 ? [] : argv.slice(0, split);
const after = split < 0 ? [] : argv.slice(split + 1);
let expected = null;
if (before.length === 5 && before[3] === "--expect") expected = before[4];
else if (before.length !== 3) inconclusive(USAGE);
if (after.length < 2) inconclusive(USAGE);
const [file, oldText, newText] = before;
const [dir, ...testArgs] = after;

if (!existsSync(file)) inconclusive(`there is no file ${file}.`);
if (!existsSync(dir) || !statSync(dir).isDirectory() || !existsSync(join(dir, "package.json"))) inconclusive(`${dir} is not a package directory.`);
if (oldText === newText) inconclusive("the old text and the new text are the same.");
const original = readFileSync(file, "utf8");
const count = original.split(oldText).length - 1;
if (count !== 1) inconclusive(`the text to change occurs ${count} times in ${file}; it must occur exactly once.`);

const nodeRunner = /\bnode\b[^&|;]*--test\b/.test(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts?.test ?? "");
const scratch = mkdtempSync(join(tmpdir(), "artroom-control-"));

/** Run the tests once. Returns what happened, never a bare exit code. */
function run(label, show) {
  const report = join(scratch, `${label}.json`);
  const command = nodeRunner
    ? ["node", ["--test", "--test-isolation=none", "--test-timeout=60000", "--test-reporter=tap", ...testArgs]]
    : ["npx", ["vitest", "run", "--reporter=default", "--reporter=json", `--outputFile.json=${report}`, ...testArgs]];
  const child = spawnSync(command[0], command[1], { cwd: dir, encoding: "utf8", timeout: TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024 });
  const output = `${child.stdout ?? ""}${child.stderr ?? ""}`;
  if (show && !nodeRunner) process.stderr.write(output);
  if (child.error) return { started: false, why: `the test command did not run (${child.error.code ?? child.error.message}).` };
  if (child.status === null) return { started: false, why: `the test command was stopped by ${child.signal}.` };
  const result = nodeRunner ? readTap(output) : readVitest(report);
  if (result === null) return { started: false, why: `the test command exited ${child.status} and left no report: it did not start, or its configuration or arguments are wrong.\n${output.trim().slice(0, 1200)}` };
  return { started: true, status: child.status, ...result };
}

/** vitest's JSON report: tests that failed, and files that failed without running a test. */
function readVitest(report) {
  let json;
  try {
    json = JSON.parse(readFileSync(report, "utf8"));
  } catch {
    return null;
  }
  const failed = [];
  const unloaded = [];
  let passed = 0;
  for (const f of json.testResults ?? []) {
    const tests = f.assertionResults ?? [];
    if (f.status === "failed" && !tests.some((t) => t.status === "failed")) unloaded.push(`${f.name}: ${firstLine(f.message)}`);
    for (const t of tests) {
      if (t.status === "passed") passed++;
      if (t.status === "failed") {
        // vitest's JSON report gives a timeout no words of its own: its stack begins "Error: STACK_TRACE_ERROR".
        const text = (t.failureMessages ?? []).join("\n");
        failed.push({ name: t.fullName, message: /^Error: STACK_TRACE_ERROR\b|\btimed out\b/im.test(text) ? "Test timed out" : firstLine(text) });
      }
    }
  }
  return { passed, failed, unloaded };
}

/** Node's TAP report: leaf tests that failed, with the error code Node gives each. */
function readTap(output) {
  if (!/^# tests \d+/m.test(output)) return null;
  const failed = [];
  const lines = output.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*not ok \d+ - (.*)$/.exec(lines[i]);
    if (!m) continue;
    const block = [];
    for (let j = i + 1; j < lines.length && !/^\s*\.\.\.\s*$/.test(lines[j]); j++) block.push(lines[j]);
    const yaml = block.join("\n");
    if (/failureType: 'subtestsFailed'/.test(yaml)) continue;
    const kind = /failureType: '([^']*)'/.exec(yaml)?.[1] ?? "unknown";
    const code = /code: '([^']*)'/.exec(yaml)?.[1] ?? "";
    const error = /error: (?:\|-\n\s*)?'?([^\n']*)/.exec(yaml)?.[1] ?? "";
    const assertion = kind === "testCodeFailure" && code === "ERR_ASSERTION";
    failed.push({ name: m[1], message: `${assertion ? "AssertionError" : kind === "testTimeoutFailure" ? "Test timed out" : `Error (${kind}${code ? ` ${code}` : ""})`}: ${error}` });
  }
  const passed = Number(/^# pass (\d+)/m.exec(output)?.[1] ?? 0);
  return { passed, failed, unloaded: [] };
}

function firstLine(text) {
  return String(text ?? "").split("\n")[0].slice(0, 300);
}
const isAssertion = (t) => /^AssertionError\b/.test(t.message);

process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));
const base = run("before", false);
if (!base.started) inconclusive(`before the change, ${base.why}`);
if (base.status !== 0 || base.failed.length > 0 || base.unloaded.length > 0 || base.passed === 0) {
  inconclusive(`the tests do not pass before the change (exit ${base.status}, ${base.passed} passed, ${base.failed.length} failed, ${base.unloaded.length} files not loaded). A control needs a passing run to compare with.`);
}
console.error(`Before the change: ${base.passed} tests pass (${resolve(dir)}: ${testArgs.join(" ")}).`);

let changed;
const restore = () => writeFileSync(file, original);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => (restore(), process.exit(130)));
try {
  writeFileSync(file, original.replace(oldText, newText));
  changed = run("after", true);
} finally {
  restore();
}

if (!changed.started) inconclusive(`with the change applied, ${changed.why}`);
console.error(`\nWith the change applied: exit ${changed.status}, ${changed.passed} passed, ${changed.failed.length} failed. The file is restored.`);
for (const t of changed.failed) console.error(`  failed: ${t.name}\n          ${t.message}`);
for (const u of changed.unloaded) console.error(`  not loaded: ${u}`);
if (changed.unloaded.length > 0) inconclusive("a test file did not load or compile with the change applied. Make the change one that compiles.");
const ran = changed.passed + changed.failed.length;
if (ran < base.passed) {
  inconclusive(`${base.passed} tests ran before the change and ${ran} with it: tests were skipped or did not run, so the two runs cannot be compared.`);
}
if (changed.failed.length === 0) {
  if (changed.status !== 0) inconclusive(`the test command exited ${changed.status} though no test failed.`);
  console.error("\nSURVIVES: the tests still pass with the change applied. They do not tell this fault from the required behaviour.");
  process.exit(1);
}
const asserted = changed.failed.filter(isAssertion);
const timedOut = changed.failed.filter((t) => /timed out/i.test(t.message));
if (timedOut.length > 0) {
  inconclusive(`${timedOut.length} test${timedOut.length === 1 ? "" : "s"} timed out with the change applied. A timeout shows nothing, and it puts the other results in doubt.${asserted.length > 0 ? ` ${asserted.length} failed by an assertion, listed above: partial evidence only.` : ""}`);
}
if (asserted.length === 0) inconclusive("the tests failed, but none by an assertion: a thrown error does not show that a test checks this behaviour.");
if (expected !== null && !asserted.some((t) => t.name.includes(expected))) {
  inconclusive(`no test whose name contains "${expected}" failed by an assertion. Other tests failed; they are not the witness you named.`);
}
console.error(`\nDISTINGUISHES: ${asserted.length} test${asserted.length === 1 ? "" : "s"} failed by an assertion with the change applied. Check that the assertion above is the one that states the invariant.`);
process.exit(0);
