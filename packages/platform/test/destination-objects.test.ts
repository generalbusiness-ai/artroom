import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";
import type { FactRef, ScopeId, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize, utf8 } from "@generalbusiness/artroom-bytes";
import { foundingObjects, importRef, receiptObjects, receiptRef, type DestinationCommit, type ObjectFormat } from "../src/destination-objects.ts";

// A real local Git repository in each object format. Facts are made up:
// this checks the byte forms and Git's names, and shows no host or founding.
const scope = `sc_${"g".repeat(51)}a` as ScopeId;
const claim: FactRef = { at: { kind: "register", scope: `sc_${"r".repeat(51)}a`, inc: `in_${"r".repeat(25)}a` }, seq: 7, hash: `sha256:${"1".repeat(64)}` };
const time = "2026-10-03T02:40:00Z" as Timestamp;

for (const format of ["sha1", "sha256"] as const) test(`Git ${format} gives the destination's computed founding and receipt IDs, including the canonical file and fact's public ref`, () => {
  const directory = mkdtempSync(join(tmpdir(), `artroom-destination-${format}-`));
  const git = (args: string[], input?: Uint8Array): string => {
    const result = spawnSync("git", ["-C", directory, ...args], { ...(input === undefined ? {} : { input }), encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trimEnd();
  };
  try {
    git(["init", "--bare", `--object-format=${format}`]);
    const write = (made: DestinationCommit) => {
      for (const object of made.objects) expect(git(["hash-object", "-w", "--stdin", "-t", object.kind], object.body)).toBe(object.id);
      expect(git(["rev-parse", `${made.commit}^{tree}`])).toBe(made.objects.find((object) => object.kind === "tree")!.id);
    };
    const first = foundingObjects(format, scope, time, claim);
    write(first);
    const commit = first.objects.at(-1)!;
    expect(commit.body.length).toBe(format === "sha1" ? 512 : 536);
    // The authority's original made-up strings have nonzero base32 padding and are no valid references. Check its
    // published byte example separately with Git; the production builder above takes a valid reference of the same length.
    const rawClaim = { ...claim, at: { ...claim.at, scope: `sc_${"r".repeat(52)}`, inc: `in_${"r".repeat(26)}` } };
    const rawIdentity = `artroom <sc_${"g".repeat(52)}@artroom.invalid> 1791000000 +0000`;
    const rawBody = utf8(`tree ${first.objects[0]!.id}\nauthor ${rawIdentity}\ncommitter ${rawIdentity}\n\nFound this repository.\n\nclaim ${canonicalize(rawClaim)}\n`);
    expect(git(["hash-object", "--stdin", "-t", "commit"], rawBody)).toBe(format === "sha1" ? "9e97ce67bca3ca7616f4c7c6793bd3bbb36428fa" : "ccc9f22b07f47573f9bd0924885ccfe94440e22f594ede3f98797fd0052ce12d");
    const operation: FactRef = { ...claim, at: { ...claim.at, kind: "destination", scope }, seq: 0, hash: `sha256:${"2".repeat(64)}` };
    const firstFact: FactRef = { ...operation, seq: 2, hash: `sha256:${"3".repeat(64)}` };
    const file = { v: 1, first: firstFact, claim, commit: first.commit };
    const receipt = receiptObjects(format, scope, time, operation, file);
    write(receipt);
    expect(git(["show", `${receipt.commit}:receipt.json`])).toBe(canonicalize(file));
    expect(receipt.objects[0]!.body).toEqual(utf8(canonicalize(file)));
    const refs = [receiptRef(operation)!, importRef(claim)!];
    expect(refs.map((ref) => ref.length)).toEqual([86, 84]);
    for (const [n, ref] of refs.entries()) {
      git(["check-ref-format", ref]);
      git(["update-ref", ref, n === 0 ? receipt.commit : first.commit]);
      expect(git(["rev-parse", ref])).toBe(n === 0 ? receipt.commit : first.commit);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("a receipt's object format is a stated input, and neither a retry nor another outcome supplies a different time or operation", () => {
  const operation: FactRef = { ...claim, hash: `sha256:${"4".repeat(64)}` };
  const file = { v: 1, publication: claim, operation, manifest: claim, commit: "a".repeat(40), reason: "single-controller:rules:one:m1:r1:h1" };
  const inFormat = (format: ObjectFormat) => receiptObjects(format, scope, time, operation, file);
  expect(inFormat("sha1")).toEqual(inFormat("sha1"));
  expect(inFormat("sha1").commit).not.toBe(inFormat("sha256").commit);
  expect(receiptObjects("sha1", scope, "2026-10-03T02:40:00.999Z", operation, file).commit).toBe(inFormat("sha1").commit);
  expect(receiptObjects("sha1", scope, "2026-10-03T02:40:01Z", operation, file).commit).not.toBe(inFormat("sha1").commit);
});
