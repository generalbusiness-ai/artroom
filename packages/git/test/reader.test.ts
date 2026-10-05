import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { GitRefusal, Reader, idOf, repositorySource, type GitReason, type ObjectType } from "../src/index.ts";
import { bare, blob, cleanup, commit, commitText, git, program, rawCommit, tree } from "./support/repo.ts";

afterAll(cleanup);

/** How a promise ended: the reason and the word of this package's refusal, or "not refused", or another error's text. */
const ending = (run: Promise<unknown>): Promise<string> => run.then(() => "not refused", (e: unknown) => (e instanceof GitRefusal ? `${e.reason}: ${e.what}` : String(e)));
/** The promise is refused by this package, with that reason and, when given, that word. A promise that resolves fails here by an assertion. */
const refused = async (run: Promise<unknown>, reason: GitReason, what?: string) => {
  const ended = await ending(run);
  expect(what === undefined ? ended.split(":")[0] : ended).toBe(what === undefined ? reason : `${reason}: ${what}`);
};
/** Every row of a table ends with its reason. One assertion, so a failure names the rows. */
const rows = async (table: readonly (readonly [string, GitReason, Promise<unknown>])[]) =>
  expect(await Promise.all(table.map(async ([row, , run]) => [row, (await ending(run)).split(":")[0]]))).toEqual(table.map(([row, reason]) => [row, reason]));

const enc = new TextEncoder();
const loose = (dir: string, id: string) => join(dir, "objects", id.slice(0, 2), id.slice(2));

// The plan's T16 (proof plan, key O15, the table "Corrupt object"; review row L13, parts 2 and 3). A local repository, not a host.
test("an object counts only when its bytes match its ID, its type and its size; a commit's parents and tree and a tree's modes are checked; an ID or a ref name is refused before it is an argument", async () => {
  const dir = bare();
  const seen = { argv: [] as string[], env: [] as string[] };
  const source = repositorySource(program(seen), dir);
  const reader = new Reader(source);

  const file = blob(dir, "one\n");
  const sub = tree(dir, [`100644 blob ${file}\tinner`]);
  const root = tree(dir, [`100644 blob ${file}\tfile`, `100755 blob ${file}\trun`, `120000 blob ${file}\tlink`, `040000 tree ${sub}\tdir`]);
  const first = commit(dir, root, []);
  const second = commit(dir, root, [first]);

  // What Git itself says of the commit and of the tree is what the reader returns. The modes are Git's own, exactly.
  expect(await reader.linked(second)).toEqual({ id: second, tree: git(dir, ["rev-parse", `${second}^{tree}`]), parents: [git(dir, ["rev-parse", `${second}^1`])] });
  expect((await reader.tree(root)).map((e) => `${e.mode.padStart(6, "0")} ${e.kind} ${e.id}\t${new TextDecoder().decode(e.name)}`).sort())
    .toEqual(git(dir, ["ls-tree", root]).split("\n").sort());

  // A parent that is not a commit, and a tree line that names a blob. Git wrote both objects: it checks a line's form and not what the line names.
  const treeAsParent = rawCommit(dir, commitText(root, [first, root]));
  await refused(reader.linked(treeAsParent), "wrong-type", "parent");
  expect((await reader.commit(treeAsParent)).parents).toEqual([first, root]);   // the lines are well formed, so the commit alone reads
  await refused(reader.linked(rawCommit(dir, commitText(file, [first]))), "wrong-type", "tree");
  // A read takes the expected type: a tree is never read as a commit.
  await refused(reader.commit(root), "wrong-type", "commit");
  await refused(reader.commit("1".repeat(40)), "missing-object", "commit");

  // The table "Corrupt object". A labelled stand-in for a store that answers wrongly: the real source, with one answer changed.
  const lying = (change: (stored: { type: string; size: number; data: Uint8Array }) => { type: string; size: number; data: Uint8Array }): Reader =>
    new Reader({ ...source, object: async (id, limit) => { const s = await source.object(id, limit); return s === null || s.data === null ? s : change({ ...s, data: s.data }); } });
  await rows([
    ["bytes that do not hash to the ID", "hash-mismatch", lying((s) => ({ ...s, data: s.data.map((b, i) => (i === s.data.length - 2 ? b ^ 1 : b)) })).commit(second)],
    ["a wrong type", "wrong-type", lying((s) => ({ ...s, type: "tree" })).commit(second)],
    ["a wrong size", "wrong-size", lying((s) => ({ ...s, size: s.size + 1 })).commit(second)],
    ["excess bytes after a complete object", "wrong-size", lying((s) => ({ ...s, data: new Uint8Array([...s.data, 0x0a]) })).commit(second)],
  ]);

  // Object bytes built in the test, under the ID they hash to: lines that Git's own writer refuses to write.
  const built = new Map<string, { type: ObjectType; data: Uint8Array }>();
  const put = (type: ObjectType, data: Uint8Array) => { const id = idOf(type, data); built.set(id, { type, data }); return id; };
  const memory = new Reader({
    object: async (id) => { const o = built.get(id); return o === undefined ? null : { type: o.type, size: o.data.length, data: o.data }; },
    ref: async () => null,
    refs: async () => [],
  });
  const entry = (mode: string, name: string) => new Uint8Array([...enc.encode(`${mode} ${name}\0`), ...Uint8Array.from({ length: 20 }, () => 0xab)]);
  const who = "author A <a@x> 1 +0000\ncommitter A <a@x> 1 +0000\n\nm\n";
  await rows([
    ["a parent line that is not a full object ID", "bad-object-id", memory.commit(put("commit", enc.encode(`tree ${root}\nparent ${first.slice(0, 39)}\n${who}`)))],
    ["a parent line in upper case", "bad-object-id", memory.commit(put("commit", enc.encode(`tree ${root}\nparent ${first.toUpperCase()}\n${who}`)))],
    ["a parent line that is a SHA-256 object ID", "unsupported-object-format", memory.commit(put("commit", enc.encode(`tree ${root}\nparent ${"a".repeat(64)}\n${who}`)))],
    ["a second tree line", "repeated-header", memory.commit(put("commit", enc.encode(`tree ${root}\ntree ${sub}\n${who}`)))],
    ["a parent line after the author", "repeated-header", memory.commit(put("commit", enc.encode(`tree ${root}\nauthor A <a@x> 1 +0000\nparent ${first}\ncommitter A <a@x> 1 +0000\n\nm\n`)))],
    ["a mode that Git does not write", "unknown-mode", memory.tree(put("tree", entry("100664", "file")))],
    ["a mode with a leading zero", "unknown-mode", memory.tree(put("tree", entry("040000", "dir")))],
    ["one name twice, as a file and as a directory", "malformed-tree", memory.tree(put("tree", new Uint8Array([...entry("100644", "a"), ...entry("100644", "a.b"), ...entry("40000", "a")])))],
  ]);
  // The control for the table: a signed commit, with a header this reader does not know, reads.
  expect(await memory.commit(put("commit", enc.encode(`tree ${root}\nparent ${first}\nauthor A <a@x> 1 +0000\ncommitter A <a@x> 1 +0000\ngpgsig -----BEGIN-----\n tree line of a signature\n -----END-----\n\nm\n`))))
    .toMatchObject({ tree: root, parents: [first] });

  // An ID or a ref name that is not well formed never reaches a command line or a command's input, from the reader or from the source alone.
  const before = seen.argv.length;
  for (const id of ["--batch-all-objects", `-${first.slice(1)}`, first.toUpperCase(), "0".repeat(40), `${first}\n${second}`]) {
    await refused(reader.commit(id), "bad-object-id");
    await refused(source.object(id, 1), "bad-object-id");
  }
  await refused(reader.commit("a".repeat(64)), "unsupported-object-format");
  for (const name of ["-refs/heads/main", "--upload-pack=/bin/sh", "refs/heads/a..b", "refs/heads/-x", "refs/heads/x.lock", "refs/heads/a b", "refs/heads/.x", "refs/heads/x/", "refs/heads", "HEAD", "refs/heads/x@{1}"]) {
    await refused(reader.ref(name), "bad-ref-name");
    await refused(source.ref(name), "bad-ref-name");
  }
  expect(seen.argv.length).toBe(before);
  // The control: a ref that exists is read, and one that does not is absent, not an error.
  git(dir, ["update-ref", "refs/artroom/staged/s/1/x/1", second]);
  git(dir, ["update-ref", "refs/artroom/staged/s/1/x/0", first]);
  expect([await reader.ref("refs/artroom/staged/s/1/x/1"), await reader.ref("refs/artroom/staged/s/1/x")]).toEqual([second, null]);
  expect(await reader.snapshot("refs/artroom/staged/")).toEqual([{ ref: "refs/artroom/staged/s/1/x/0", target: first }, { ref: "refs/artroom/staged/s/1/x/1", target: second }]);
  // No command of all those above had anything but this package's own environment.
  expect(new Set(seen.env).size).toBe(1);
});

// The plan's T17 (key O15, the table "Interrupted transfer"). A local repository, not a host. A transfer that stopped part way is shown
// as what it leaves behind: a commit that resolves by its ID, with an object under it absent.
test("a closure is complete object by object: a commit that resolves with one object absent or corrupt under it is not complete, and nothing of it counts", async () => {
  const dir = bare();
  const source = repositorySource(program(), dir);
  const reader = new Reader(source);
  const [kept, cut] = [blob(dir, "kept\n"), blob(dir, "cut\n")];
  const base = commit(dir, tree(dir, [`100644 blob ${kept}\tkept`]), []);
  const sub = tree(dir, [`100644 blob ${cut}\tcut`]);
  const head = commit(dir, tree(dir, [`100644 blob ${kept}\tkept`, `040000 tree ${sub}\tsub`]), [base]);

  // Complete: every object that Git lists as reachable was read and checked, and no more.
  expect(await reader.closure(head)).toEqual({ complete: true, objects: git(dir, ["rev-list", "--objects", head]).split("\n").length });

  // Corrupt, and not absent: the closure names the object and why.
  const corrupt = new Reader({ ...source, object: async (id, limit) => { const s = await source.object(id, limit); return id === cut && s?.data ? { ...s, data: enc.encode("CUT\n") } : s; } });
  expect(await corrupt.closure(head)).toEqual({ complete: false, at: cut, reason: "hash-mismatch" });

  // The transfer stopped before the last blob arrived. The commit and its trees are here, and the commit ID still resolves.
  rmSync(loose(dir, cut));
  expect((await reader.commit(head)).parents).toEqual([base]);
  expect(await reader.closure(head)).toEqual({ complete: false, at: cut, reason: "missing-object" });
  // The base lost nothing, so it is complete by itself, and a walk that stops at it does not vouch for what is above it.
  expect((await reader.closure(base)).complete).toBe(true);
  expect(await reader.closure(head, new Set([base]))).toEqual({ complete: false, at: cut, reason: "missing-object" });

  // A gitlink names a commit of another repository, which no closure here can hold.
  const linked = commit(dir, tree(dir, [`160000 commit ${"2".repeat(40)}\tmodule`]), [base]);
  expect(await reader.closure(linked)).toMatchObject({ complete: false, reason: "gitlink" });
  // A source that cannot answer is not an absence: the check is refused whole, and it says nothing of the source's own words.
  const down = new Reader({ ...source, object: () => Promise.reject(new Error("https://user:secret@host/ answered 502")) });
  expect(await down.closure(base).catch((e: unknown) => (e as Error).message)).toBe("unreadable: commit");
});
