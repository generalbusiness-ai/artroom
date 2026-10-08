import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";
import type { FactRef, ScopeId, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize, digestBytes, utf8 } from "@generalbusiness/artroom-bytes";
import { d, otherLane } from "@generalbusiness/artroom-derive/testing";
import { editCommit, editObjects, editPath, type DestinationObject } from "../src/future-2/destination-objects.ts";
import { judgeReservation, type EditFile, type ReservationRead, type Statement } from "../src/future-2/reservation.ts";
import { FOUND, HEAD, TREE, reading as nativeReading } from "./support-destination.ts";

// A one-file edit (i5 edit; plan 025, section 2). The objects are checked against a real local Git repository in each object
// format: the facts are made up, and no host, push or founding is shown. The judgment is the plain function, with a reading
// written by hand.
const scope = `sc_${"g".repeat(51)}a` as ScopeId;
const operation: FactRef = { at: { kind: "lane", scope: `sc_${"l".repeat(51)}a`, inc: `in_${"l".repeat(25)}a` }, seq: 9, hash: `sha256:${"5".repeat(64)}` };
const time = "2026-10-07T12:00:00Z" as Timestamp;
/** Native fixture reading with only the explicitly scripted future manifest override. */
const reading = (at: Timestamp, over: Partial<ReservationRead> = {}): ReservationRead => ({ ...nativeReading(at), ...over });

for (const format of ["sha1", "sha256"] as const) test(`Git ${format} reads an edit's objects as the published tree with one file written: a new file, a replaced one and one in a new folder; every other entry, a link's among them, is unchanged; a path that a folder, a link or a file on the way holds gives no objects`, () => {
  const directory = mkdtempSync(join(tmpdir(), `artroom-edit-${format}-`));
  const git = (args: string[], input?: Uint8Array | string): string => {
    const result = spawnSync("git", ["-C", directory, ...args], { ...(input === undefined ? {} : { input }), encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "a", GIT_AUTHOR_EMAIL: "a@a.invalid", GIT_COMMITTER_NAME: "a", GIT_COMMITTER_EMAIL: "a@a.invalid", GIT_AUTHOR_DATE: "1791000000 +0000", GIT_COMMITTER_DATE: "1791000000 +0000" } });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trimEnd();
  };
  try {
    git(["init", "-q", `--object-format=${format}`]);
    writeFileSync(join(directory, "README.md"), "# Old\n");
    spawnSync("mkdir", ["-p", join(directory, "docs"), join(directory, "z")]);
    writeFileSync(join(directory, "docs", "guide.md"), "# Guide\n");
    writeFileSync(join(directory, "z", "keep.txt"), "keep\n");
    spawnSync("ln", ["-s", "docs", join(directory, "link")]);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "base"]);
    const base = git(["rev-parse", "HEAD"]);
    // `read`: an object of the base's closure, as the host would give it.
    const read = (id: string): DestinationObject | null => {
      const kind = git(["cat-file", "-t", id]) as DestinationObject["kind"];
      const body = spawnSync("git", ["-C", directory, "cat-file", kind, id]).stdout as Buffer;
      return { kind, id, body: new Uint8Array(body) };
    };
    const edit = (path: string, text: string) => editObjects(format, read, base, path, utf8(text), { scope, time, operation });
    const written = (path: string, text: string) => {
      const made = edit(path, text)!;
      for (const object of made.objects) expect(git(["hash-object", "-w", "--stdin", "-t", object.kind], object.body)).toBe(object.id);
      git(["fsck", "--strict", "--no-dangling", made.commit]);
      // Git's own tree for the same change: the base's index, with the one file added.
      git(["read-tree", base]);
      git(["update-index", "--add", "--cacheinfo", `100644,${git(["hash-object", "-w", "--stdin"], text)},${path}`]);
      expect([made.tree, git(["rev-parse", `${made.commit}^{tree}`]), git(["rev-parse", `${made.commit}^`])]).toEqual([git(["write-tree"]), made.tree, base]);
      expect(git(["show", `${made.commit}:${path}`])).toBe(text.trimEnd());
      expect(git(["diff", "--name-only", base, made.commit])).toBe(path);
      return made;
    };
    const replaced = written("README.md", "# New\n\nWritten by the room.\n");
    written("NEW.md", "new\n");
    written("docs/deep/page.md", "deep\n");
    // The commit is `editCommit`'s, of that tree on the base.
    expect(replaced.commit).toBe(editCommit(format, scope, time, replaced.tree, base, "README.md", operation).id);
    expect(git(["log", "-1", "--format=%an <%ae>%n%B", replaced.commit])).toBe(`artroom <${scope}@artroom.invalid>\nWrite README.md.\n\noperation ${canonicalize(operation)}`);
    // The published tree does not let these be written: a folder at the path, a link at the path or on the way, a file on the way.
    expect([edit("docs", "x"), edit("link", "x"), edit("link/guide.md", "x"), edit("README.md/x", "x"), edit("../x", "x")]).toEqual([null, null, null, null, null]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("editPath gives the segments of a path that a published tree may hold, and refuses an empty, a dot, a parent and a .git segment, a control character and a path over 1024 bytes", () => {
  expect([editPath("README.md"), editPath("docs/a b/é.md")]).toEqual([["README.md"], ["docs", "a b", "é.md"]]);
  expect(["", "/a", "a/", "a//b", "./a", "a/../b", ".git/config", "x/.GIT/y", "a\nb", "a\u0000b", "a".repeat(1025), 7].map(editPath)).toEqual(Array(12).fill(null));
  expect(editPath("a".repeat(1024))).toEqual(["a".repeat(1024)]);
});

// Invariant: the rule `judge` reserves a one-file manifest only for a path that a tree may hold, bytes that are the ones it states,
// evidence whose changed set is that path alone, on the base, and with the tree and commit the caller derived; every other case is
// refused by name.
test("the judgment of a one-file manifest: a bad path is path-invalid before what the evidence lacks; bytes unlike their digest or size, a changed set beyond the path, or another first parent are integration-invalid; otherwise reserved with the commit the destination writes", () => {
  const content = "# Page\n";
  const file: EditFile = { path: "src/a.ts", digest: digestBytes(utf8(content)), size: utf8(content).length, content };
  const statement: Statement = { operation: { at: otherLane, seq: 1, hash: d("a") }, manifest: { at: otherLane, seq: 2, hash: d("a") }, verdicts: [], jobs: [], reports: [], links: [] };
  const commit = "c".repeat(40);
  const read = (over: Partial<EditFile> = {}) => reading(time, { manifest: { base: HEAD, integration: commit, tree: TREE, file: { ...file, ...over }, reports: [], authors: [], complete: true } });
  const judge = (asked: Partial<Parameters<typeof judgeReservation>[0]> = {}) => judgeReservation({ recorded: HEAD, evidence: FOUND, statement, read: read(), time, file, ...asked });
  expect(judge()).toEqual({ reserved: true, integration: commit, reason: null });
  // path-invalid: said with no read of the lane, and before the evidence's lack, but after a head that moved.
  for (const path of ["../a.ts", ".git/hooks/x", ""]) expect(judge({ file: { ...file, path }, read: null, evidence: { ...FOUND, present: false, tree: null, firstParent: null, changes: null } })).toEqual({ reserved: false, reason: "path-invalid" });
  expect(judge({ file: { ...file, path: "../a.ts" }, recorded: "e".repeat(40) })).toEqual({ reserved: false, reason: "out-of-date" });
  expect([judge({ read: read({ size: file.size + 1 }) }), judge({ read: read({ digest: d("b") }) }), judge({ evidence: { ...FOUND, changes: { paths: ["src/a.ts", "src/b.ts"], links: [], unreadable: 0 } } }), judge({ evidence: { ...FOUND, firstParent: "e".repeat(40) } })])
    .toEqual(Array(4).fill({ reserved: false, reason: "integration-invalid" }));
  // The caller derives the tree and the commit; without them nothing is reserved.
  expect(judge({ read: reading(time, { manifest: { base: HEAD, integration: null, tree: null, file, reports: [], authors: [], complete: true } }) })).toEqual({ reserved: false, reason: "integration-invalid" });
});
