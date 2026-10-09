#!/usr/bin/env -S node --import tsx --no-warnings
// The demo runner: a rehearsal of the demo script's middle against a deployment, with a transcript.
//
//   node --import tsx --no-warnings scripts/demo-run.ts <base-url> --host <git-host> --namespace <name> \
//     --scratch <empty directory> --out <directory> [--name <room>] [--setting-set] [--pace]
//
// It runs the shots of `scripts/demo/rehearse.ts` in order, as the command line's own functions, each as its person: the founder,
// a member and a maintainer, each with a fresh config directory under the scratch directory (`founder`, `member`, `maintainer`).
// The local files the commands read, and the member's clone, are in `work` under it. After the plan it prints the register ID
// and waits for Enter while the operator pins it in the Git host's setting; `--setting-set` skips that wait.
//
// It writes `transcript.md` and `room.json` (the room's IDs, no secret) in the output directory, and exits 1 if any shot did not
// print what the script expects. It prints no secret: an invitation link is cut to its first letters.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileStore } from "../packages/cli/src/files.ts";
import { nodeGit } from "../packages/cli/src/git.ts";
import type { Context, Outcome } from "../packages/cli/src/commands.ts";
import { FILES, registerSetting, rehearse, transcript, type NextShot, type Person, type Stage, type Taken } from "./demo/rehearse.ts";
import { keepCaptureObservations, observeCaptures } from "./demo/capture-context.ts";

const USAGE = "Usage: scripts/demo-run.ts <base-url> --host <git-host> --namespace <name> --scratch <empty directory> --out <directory> [--name <room>] [--setting-set] [--pace]";

function options(argv: readonly string[]): { service: string; host: string; namespace: string; scratch: string; out: string; name: string; settingSet: boolean; pace: boolean } | string {
  const words: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--setting-set" || arg === "--pace") flags.set(arg.slice(2), "true");
    else if (arg.startsWith("--")) {
      const value = argv[++i];
      if (value === undefined) return `${arg} needs a value.`;
      flags.set(arg.slice(2), value);
    } else words.push(arg);
  }
  const unknown = [...flags.keys()].find((flag) => !["host", "namespace", "scratch", "out", "name", "setting-set", "pace"].includes(flag));
  if (unknown !== undefined) return `There is no --${unknown}.`;
  const [service, ...more] = words;
  if (service === undefined || more.length > 0) return "Give one base URL.";
  for (const flag of ["host", "namespace", "scratch", "out"]) if (!flags.has(flag)) return `--${flag} is needed.`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(4, 13).replace("T", "-").toLowerCase();
  return { service, host: flags.get("host")!, namespace: flags.get("namespace")!, scratch: resolve(flags.get("scratch")!), out: resolve(flags.get("out")!), name: flags.get("name") ?? `rehearsal-${stamp}`, settingSet: flags.has("setting-set"), pace: flags.has("pace") };
}

/** `git` with its output kept, in the working directory. */
function gitLines(args: readonly string[], cwd: string): Promise<Outcome> {
  return new Promise((done) => {
    const child = spawn("git", [...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { out += chunk.toString("utf8"); });
    child.on("error", () => done({ code: 1, lines: ["git is not installed here."] }));
    child.on("close", (code) => done({ code: code === 0 ? 0 : 1, lines: out.split("\n").filter((line) => line.length > 0) }));
  });
}

const shown = (shot: Taken) => [
  `--- ${shot.n}. ${shot.title} (${shot.who}, ${shot.seconds} s): ${shot.match ? "matches" : `DOES NOT MATCH: ${shot.why}`}`,
  `$ ${shot.typed}`, ...shot.lines, ...(shot.note ? [`(${shot.note})`] : []),
].join("\n");

async function main(argv: readonly string[]): Promise<number> {
  const given = options(argv);
  if (typeof given === "string") { process.stderr.write(`${given}\n${USAGE}\n`); return 2; }
  const runStarted = performance.now();
  const work = join(given.scratch, "work");
  for (const who of ["founder", "member", "maintainer"] as const) {
    if (existsSync(join(given.scratch, who)) && readdirSync(join(given.scratch, who)).length > 0) {
      process.stderr.write(`${join(given.scratch, who)} is not empty. Each person needs a fresh config directory: give another --scratch.\n`);
      return 2;
    }
  }
  if (existsSync(join(work, "site"))) { process.stderr.write(`${join(work, "site")} exists already: give another --scratch.\n`); return 2; }
  mkdirSync(work, { recursive: true });
  mkdirSync(given.out, { recursive: true });
  for (const [name, bytes] of Object.entries(FILES)) writeFileSync(join(work, name), bytes);
  // `artroom clone site` clones into the working directory, as the member types it there.
  process.chdir(work);

  const read = async (path: string): Promise<Uint8Array | null> => { try { return new Uint8Array(await readFile(join(work, path))); } catch { return null; } };
  const started = new Date().toISOString();
  const people: Partial<Record<Person, Context>> = {};
  const stage: Stage = {
    service: given.service, host: given.host, namespace: given.namespace, name: given.name,
    person: (who: Person) => (people[who] = { store: fileStore(join(given.scratch, who)), git: nodeGit(), read }),
    pin: async (register) => {
      const setting = registerSetting(given.host);
      if (given.settingSet) return `--setting-set was given: the runner did not wait for ${setting} = ${register}. It did not inspect the deployment's setting.`;
      process.stdout.write(`\nSet ${setting} to ${register} (docs/deploy.md), then press Enter. Preserve the other settings and secrets; finish before the plan's printed expiry.\n`);
      const asked = createInterface({ input: process.stdin, output: process.stdout });
      const waited = Date.now();
      await asked.question("");
      asked.close();
      return `The operator confirmed ${setting} = ${register} by pressing Enter after ${Math.round((Date.now() - waited) / 1000)} seconds. The runner did not inspect the deployment's setting.`;
    },
    get: async (url) => {
      try {
        const answer = await fetch(url);
        return { status: answer.status, type: answer.headers.get("content-type") ?? "", body: await answer.text() };
      } catch (error) {
        return { status: 0, type: `no answer (${error instanceof Error ? error.message : String(error)})`, body: "" };
      }
    },
    log: (directory) => gitLines(["-C", directory, "log", "--oneline"], work),
    ...(given.pace ? { beforeShot: async (shot: NextShot) => {
      process.stdout.write(`\n--- Next: ${shot.n}. ${shot.title}\nScript shot ${shot.scene}. As the ${shot.who}.\n$ ${shot.typed}\n`);
      const asked = createInterface({ input: process.stdin, output: process.stdout });
      try { await asked.question("Press Enter to run this shot. "); } finally { asked.close(); }
    } } : {}),
    told: (shot) => process.stdout.write(`${shown(shot)}\n`),
  };
  const rehearsal = await rehearse(stage);
  const how = `Run by scripts/demo-run.ts under Node ${process.version}, room ${given.name}, config directories under ${given.scratch}.`;
  writeFileSync(join(given.out, "transcript.md"), transcript(rehearsal, { service: given.service, host: given.host, namespace: given.namespace, started, how }));
  writeFileSync(join(given.out, "room.json"), `${JSON.stringify({ ...rehearsal.room, name: given.name, homes: { founder: join(given.scratch, "founder"), member: join(given.scratch, "member"), maintainer: join(given.scratch, "maintainer") } }, null, 2)}\n`);
  if (rehearsal.ok) {
    const births = await observeCaptures(people.founder!, rehearsal.room);
    for (const who of ["founder", "member", "maintainer"] as const) await keepCaptureObservations(join(given.scratch, who), people[who]!, rehearsal.room, births);
  }
  const failed = rehearsal.shots.filter((shot) => !shot.match).map((shot) => shot.n);
  process.stdout.write(`\n${rehearsal.ok ? `All ${rehearsal.shots.length} shots as the script expects.` : `Not as the script expects: shots ${failed.join(", ")}.`} Transcript: ${join(given.out, "transcript.md")}\n`);
  process.stdout.write(`Observed total elapsed: ${((performance.now() - runStarted) / 1000).toFixed(1)} seconds (including operator waits, setup and capture observations).\nSum of shot seconds: ${rehearsal.shots.reduce((sum, shot) => sum + shot.seconds, 0).toFixed(1)} seconds (a sum of the recorded shot durations).\n`);
  return rehearsal.ok ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
