/**
 * Bridge from a recorded real Scope run to a real Node/Git checkout. The Scope
 * recorder's bytes and heads are the input, not a second invented manifest.
 * The local canonical Git repository and `check` executable are STAND-INs;
 * this is two runtimes joined by an identified artifact, not a provider or
 * container deployment and not a single-process end-to-end test. The image
 * digest is a configuration fixture; no image with that digest is run.
 *
 * The frozen public record's bytes and producer metadata live beside this
 * test. A run checks that record again; it does not rerun the Scope recorder.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import type { Digest, Head, ScopeRef, Sealed, SignedIntent } from "@generalbusiness/artroom-contract";
import { canonicalize, digestBytes, entryHash, isEntry, parseStrict, unb64url, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { READ_BOUNDS, Reader, idOf, objectId, refName, snapshotFiles } from "@generalbusiness/artroom-git";
import { readConfiguration } from "../src/configuration.ts";
import { checkout, runSteps, type StepExec } from "../src/runner.ts";
import { bare, cleanup, git, program, scratch, setRef } from "../../git/test/support/repo.ts";

interface Record {
  readAsk: SignedIntent;
  destinationHead: Head;
  laneHead: Head;
  configuration: unknown;
  configurationDigest: Digest;
  snapshot: {
    destination: ScopeRef;
    job: Sealed;
    manifest: Sealed;
    reservation: Sealed;
    sources: Sealed[];
    base: string;
    commit: string;
    tree: string;
    ref: string;
    remote: string;
    objects: { id: string; type: "blob" | "tree" | "commit"; data: string }[];
  };
}

afterAll(cleanup);
const recordFile = new URL("./fixtures/reservation-record.json", import.meta.url);

test("the same recorded Scope reservation is imported, staged under its exact ref, fetched by the runner, and checked by the fixture's configured Node step; absent or changed staging starts no step (local Git STAND-IN)", async () => {
  const raw = readFileSync(recordFile);
  const artifactHash = createHash("sha256").update(raw).digest("hex");
  expect(artifactHash).toBe("e0c0f1023925207bde7f52859d91601e76cd85c6093427244ae164df963fe4c9");
  const producer = parseStrict(readFileSync(new URL("./fixtures/reservation-record-producer.json", import.meta.url), "utf8"));
  expect(producer).toMatchObject({ recordSha256: artifactHash, recordBytes: raw.length });
  const record = parseStrict(raw.toString("utf8")) as unknown as Record;
  expect(canonicalize(record)).toBe(raw.toString("utf8"));
  const { snapshot } = record;
  for (const sealed of [snapshot.job, snapshot.manifest, snapshot.reservation, ...snapshot.sources]) {
    expect(isEntry(sealed.entry)).toBe(true);
    expect(entryHash(sealed.entry)).toBe(sealed.hash);
    if (sealed.entry.input.type === "act") expect(verifySignedIntent(sealed.entry.input.signed)).toBe(true);
  }
  expect(verifySignedIntent(record.readAsk)).toBe(true);
  expect(record.readAsk.intent.kind).toBe("git-read@1:job-read");
  expect(record.readAsk.intent.fields["job"]).toEqual({ at: snapshot.job.entry.at, seq: snapshot.job.entry.seq, hash: snapshot.job.hash });
  expect(record.readAsk.intent.to).toEqual(snapshot.job.entry.at);
  expect(snapshot.reservation.entry.at).toEqual(snapshot.destination);
  expect(record.destinationHead.seq).toBeGreaterThanOrEqual(snapshot.reservation.entry.seq);
  expect(record.laneHead.seq).toBeGreaterThanOrEqual(snapshot.job.entry.seq);
  expect([record.destinationHead.hash, record.laneHead.hash]).toEqual([expect.stringMatching(/^sha256:[0-9a-f]{64}$/), expect.stringMatching(/^sha256:[0-9a-f]{64}$/)]);
  const configuration = readConfiguration(canonicalize(record.configuration), record.configurationDigest);
  expect(configuration).not.toBeNull();
  if (!configuration) return;
  const jobValue = (slot: string) => snapshot.job.entry.effects.find((effect) => effect.effect === "value" && effect.item === snapshot.job.entry.seq && effect.slot === slot);
  expect(jobValue("configuration")).toMatchObject({ value: record.configurationDigest });
  expect(jobValue("tree")).toMatchObject({ value: snapshot.tree });
  expect(configuration.steps).toEqual([["check", "text"]]);
  expect(configuration.environment).toEqual([]);
  const ref = refName(snapshot.ref, "reservation ref");
  expect(ref).toBe(`refs/artroom/reservations/${snapshot.reservation.hash.slice(7)}`);
  const commit = objectId(snapshot.commit, "commit"), tree = objectId(snapshot.tree, "tree"), base = objectId(snapshot.base, "base");
  expect(snapshot.job.entry.effects).toContainEqual({ effect: "ref", item: snapshot.job.entry.seq, slot: "manifest", to: snapshot.manifest.entry.seq });
  expect(snapshot.manifest.entry.input.type).toBe("act");
  if (snapshot.manifest.entry.input.type !== "act") return;
  expect(snapshot.manifest.entry.input.signed.intent.fields["base"]).toBe(base);
  expect(snapshot.reservation.entry.effects).toEqual(expect.arrayContaining([expect.objectContaining({ effect: "value", slot: "integration", value: commit }), expect.objectContaining({ effect: "value", slot: "tree", value: tree })]));
  expect(snapshot.objects.length).toBeLessThanOrEqual(READ_BOUNDS.closureObjects);
  const objects = snapshot.objects.map((object) => {
    expect(["blob", "tree", "commit"]).toContain(object.type);
    const limit = object.type === "blob" ? READ_BOUNDS.blobBytes : object.type === "tree" ? READ_BOUNDS.treeBytes : READ_BOUNDS.commitBytes;
    expect(object.data.length).toBeLessThanOrEqual(Math.ceil(limit * 4 / 3));
    const data = unb64url(object.data);
    expect(data).not.toBeNull();
    expect(data!.length).toBeLessThanOrEqual(limit);
    expect(idOf(object.type, data!)).toBe(objectId(object.id, "object"));
    return { ...object, data: data! };
  });
  const byId = new Map(objects.map((object) => [object.id, object]));
  expect(byId.size).toBe(objects.length);
  const reached = new Set<string>();
  const reader = new Reader({ object: async (id) => { const object = byId.get(id); if (!object) return null; reached.add(id); return { type: object.type, size: object.data.length, data: object.data }; }, ref: async () => null, refs: async () => [] });
  const linked = await reader.linked(commit);
  expect([linked.tree, linked.parents[0]]).toEqual([tree, base]);
  expect(await reader.closure(commit)).toMatchObject({ complete: true });
  expect(reached.size).toBe(objects.length);
  const files = await snapshotFiles(reader, tree, () => true);
  const before = await snapshotFiles(reader, (await reader.linked(base)).tree, () => true);
  const sourcePaths = snapshot.sources.map((source) => source.entry.input.type === "act" ? source.entry.input.signed.intent.fields["path"] as string : "");
  expect(sourcePaths.sort()).toEqual(["docs/two.md", "one.md"]);
  expect(files.map((file) => file.path).sort()).toEqual([...new Set([...before.map((file) => file.path), ...sourcePaths])].sort());
  for (const unchanged of before.filter((file) => !sourcePaths.includes(file.path))) expect(files.find((file) => file.path === unchanged.path)).toEqual(unchanged);
  for (const source of snapshot.sources) {
    expect(source.entry.input.type).toBe("act");
    if (source.entry.input.type !== "act") return;
    const fields = source.entry.input.signed.intent.fields;
    expect(source.entry.input.signed.intent.kind).toBe("propose-file");
    expect(fields["base"]).toBe(base);
    const bytes = utf8(fields["content"] as string);
    expect([bytes.length, digestBytes(bytes)]).toEqual([fields["size"], fields["digest"]]);
    const expectedRow: unknown = { path: fields["path"], digest: fields["digest"], entry: { at: source.entry.at, seq: source.entry.seq, hash: source.hash } };
    expect(snapshot.manifest.entry.input.signed.intent.fields["files"]).toEqual(expect.arrayContaining([expectedRow]));
    const file = files.find((file) => file.path === fields["path"]);
    expect(file).toBeDefined();
    expect(await reader.blob(file!.id)).toEqual(bytes);
  }

  // All recorded bytes are checked above before the first Git write. Import
  // exactly those bytes; neither an expected tree nor a base is rebuilt here.
  const remote = bare();
  const native = program();
  for (const object of objects) expect((await native.ok("hash-object", ["-C", remote, "hash-object", "-w", "--no-filters", "-t", object.type, "--stdin"], object.data)).trim()).toBe(object.id);
  setRef(remote, "refs/heads/main", base);
  setRef(remote, ref, commit);
  const commands = { argv: [] as string[], env: [] as string[] };
  const work = join(scratch(), "checked");
  const checked = await checkout(program(commands), { remote, dir: work, ref, commit, tree, base });
  expect(checked).toEqual({ confirmed: true, commit, tree, parents: linked.parents });
  expect(git(work, ["rev-parse", "FETCH_HEAD"])).toBe(commit);
  expect(git(work, ["write-tree"])).toBe(tree);

  // The local runner resolves `check` to this controlled Node executable;
  // the recorded argv and empty environment stay exactly as configured.
  const executable = join(scratch(), "check");
  writeFileSync(executable, `#!${process.execPath}\nconst fs = require('node:fs'); const good = process.argv[2] === 'text' && fs.readFileSync('one.md', 'utf8') === '# One\\n' && fs.readFileSync('docs/two.md', 'utf8') === '# Two\\n'; console.log(good ? 'ok' : 'bad'); process.exit(good ? 0 : 1);\n`, { mode: 0o700 });
  let executions = 0;
  const exec: StepExec = (argv, options) => new Promise((resolve) => {
    executions++;
    expect(argv).toEqual(configuration.steps[0]);
    const began = performance.now();
    execFile(executable, argv.slice(1), { cwd: options.cwd, env: Object.fromEntries(options.env.map((variable) => [variable.name, variable.value])), timeout: options.secondsLeft * 1000, maxBuffer: options.outputBytesLeft, encoding: "buffer", killSignal: "SIGKILL" }, (error, stdout, stderr) => {
      resolve({ status: error === null ? 0 : typeof error.code === "number" ? error.code : null, line: stdout.toString("utf8").trim().split("\n").at(-1) ?? "", seconds: (performance.now() - began) / 1000, outputBytes: stdout.length + stderr.length });
    });
  });
  const steps = await runSteps(exec, configuration, work);
  expect(steps).toEqual({ end: "complete", steps: [configuration.judged.passed] });
  for (const target of [null, base]) {
    if (target === null) git(remote, ["update-ref", "-d", ref]); else setRef(remote, ref, target);
    const refusedDir = join(scratch(), "refused");
    const refused = await checkout(program(), { remote, dir: refusedDir, ref, commit, tree, base });
    expect(refused).toEqual({ confirmed: false, reason: target === null ? "fetch-failed" : "reservation-mismatch" });
    if (refused.confirmed) await runSteps(exec, configuration, refusedDir);
  }
  expect(executions).toBe(1);
  expect(git(remote, ["rev-parse", "refs/heads/main"])).toBe(base);
  expect(commands.argv.filter((argv) => argv.includes(" fetch "))).toEqual([expect.stringContaining(` -- ${remote} ${ref}`)]);
  console.log("RESERVATION_NODE", canonicalize({ artifactHash, producer, destinationHead: record.destinationHead, laneHead: record.laneHead, reservation: { at: snapshot.destination, seq: snapshot.reservation.entry.seq, hash: snapshot.reservation.hash }, job: { at: snapshot.job.entry.at, seq: snapshot.job.entry.seq, hash: snapshot.job.hash }, ref, commit, tree, base, objects: objects.map(({ id, type, data }) => ({ id, type, bytes: data.length })), configuration: record.configurationDigest, steps }));
});
