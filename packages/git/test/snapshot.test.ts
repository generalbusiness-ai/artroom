import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { GitRefusal, Reader, repositorySource, snapshotCommit, snapshotFiles, type SnapshotFile } from "../src/index.ts";
import { bare, blob, cleanup, git, program, put, tree } from "./support/repo.ts";

afterAll(cleanup);

// One bare repository for the file: a local repository, not a host. The first test only reads it. The second writes the objects that
// `snapshotCommit` built, and asks the real `git` to read them. The third removes one loose tree, which no other test reads.
let dir: string;
let f: Record<"one" | "two" | "docs" | "deep" | "root" | "cutSub" | "cutRoot" | "linked", string>;
beforeAll(() => {
  dir = bare();
  const [one, two] = [blob(dir, "one\n"), blob(dir, "two\n")];
  const deep = tree(dir, [`100755 blob ${two}\trun.sh`]);
  const docs = tree(dir, [`100644 blob ${one}\tguide.md`, `040000 tree ${deep}\ttools`]);
  // Git's order: `a-b`, then `a.b`, then the directory `a`, whose name is ordered as `a/`.
  const root = tree(dir, [`100644 blob ${one}\ta-b`, `100644 blob ${two}\ta.b`, `040000 tree ${docs}\ta`, `120000 blob ${one}\tlink`]);
  const cutSub = tree(dir, [`100644 blob ${two}\tgone`]);
  const cutRoot = tree(dir, [`100644 blob ${one}\tkept`, `040000 tree ${cutSub}\tsub`]);
  const linked = tree(dir, [`160000 commit ${"2".repeat(40)}\tmodule`]);
  f = { one, two, docs, deep, root, cutSub, cutRoot, linked };
});

const reader = () => new Reader(repositorySource(program(), dir));
const refused = async (run: () => unknown): Promise<string> => {
  try { await run(); return "not refused"; } catch (e) { return e instanceof GitRefusal ? e.reason : `threw ${String(e)}`; }
};

test("the files of a snapshot are the tree's own, read through the reviewed reader: each path with its exact mode and blob, in the tree's order; a rule keeps a subset, and a tree read whole of which nothing is kept is the empty list", async () => {
  const all = await snapshotFiles(reader(), f.root, () => true);
  expect(all).toEqual([
    { path: "a-b", mode: "100644", id: f.one }, { path: "a.b", mode: "100644", id: f.two },
    { path: "a/guide.md", mode: "100644", id: f.one }, { path: "a/tools/run.sh", mode: "100755", id: f.two }, { path: "link", mode: "120000", id: f.one },
  ]);
  expect([await snapshotFiles(reader(), f.root, (path) => path.startsWith("a/")), await snapshotFiles(reader(), f.root, () => false)]).toEqual([[all[2], all[3]], []]);
  // A gitlink names a commit of another repository. A bound that is passed refuses the read: no shorter list is returned.
  expect([await refused(() => snapshotFiles(reader(), f.linked, () => true)), await refused(() => snapshotFiles(reader(), f.root, () => true, { files: 4, trees: 10, pathBytes: 4096, depth: 8 })), await refused(() => snapshotFiles(reader(), f.root, () => true, { files: 10, trees: 2, pathBytes: 4096, depth: 8 }))])
    .toEqual(["gitlink", "too-large", "too-large"]);
});

test("the snapshot commit is a function of the files and the message: the real `git` reads the built trees as exactly those files and finds no fault in them; the order of the list changes nothing; a path that is twice there, or is a file and a directory, a mode that is no file's, and a path that Git would not check out are each refused, and nothing is built", async () => {
  const files = await snapshotFiles(reader(), f.root, (path) => path !== "link");
  const message = "a filtered snapshot, for a test\n";
  const built = snapshotCommit(files, message);
  // The IDs are checked against Node's own SHA-1, in test support, as each object is written as Git writes a loose object.
  expect(built.objects.map((o) => put(dir, o.type, o.data))).toEqual(built.objects.map((o) => o.id));
  expect([built.objects.at(-1)!.id, built.objects.filter((o) => o.type === "tree").length]).toEqual([built.commit, 3]);
  // The real `git` reads the commit: its tree, no parent, and exactly the files, each with its mode and blob, in Git's order. `fsck` checks each tree's form and order.
  const listed = git(dir, ["ls-tree", "-r", built.commit]).split("\n").map((line) => { const [head, path] = line.split("\t") as [string, string]; const [mode, , id] = head.split(" ") as [string, string, string]; return { path, mode, id }; });
  expect([git(dir, ["rev-parse", `${built.commit}^{tree}`]), git(dir, ["rev-list", "--parents", built.commit]), listed, git(dir, ["fsck", "--strict", "--no-dangling", built.commit])]).toEqual([built.tree, built.commit, [files[0], files[1], files[2], files[3]], ""]);
  expect([snapshotCommit([...files].reverse(), message).commit, snapshotCommit(files, "another message\n").commit === built.commit, snapshotCommit([], message).tree]).toEqual([built.commit, false, "4b825dc642cb6eb9a060e54bf8d69288fbee4904"]);

  const file = (path: string, mode = "100644", id = f.one) => ({ path, mode, id }) as SnapshotFile;
  const why = (list: SnapshotFile[], text = message) => refused(() => snapshotCommit(list, text));
  expect(await Promise.all([
    why([file("a"), file("a")]),                       // one path twice
    why([file("a"), file("a/b")]),                     // a file, then a directory of that name
    why([file("a/b"), file("a")]),                     // a directory, then a file of that name
    why([file("a", "040000")]), why([file("a", "100664")]), why([file("a", "160000")]),
    why([file("a", "100644", "0".repeat(40))]), why([file("a", "100644", "A".repeat(40))]),
    why([file("")]), why([file("a//b")]), why([file("/a")]), why([file("a/../b")]), why([file("./a")]), why([file("a/.GIT/config")]), why([file("a\nb")]),
    why([file("a")], "no newline at the end"), why([file("a")], ""),
  ])).toEqual([
    "path-conflict", "path-conflict", "path-conflict", "unknown-mode", "unknown-mode", "unknown-mode", "bad-object-id", "bad-object-id",
    "bad-path", "bad-path", "bad-path", "bad-path", "bad-path", "bad-path", "bad-path", "malformed-commit", "malformed-commit",
  ]);
});

test("a tree that cannot be read is not an empty tree (host review, fault A3): with one subtree absent the whole read is refused `missing-object`, whether or not the rule keeps a file under it, and no list is returned; the same tree whole gives its files", async () => {
  expect(await snapshotFiles(reader(), f.cutRoot, () => true)).toEqual([{ path: "kept", mode: "100644", id: f.one }, { path: "sub/gone", mode: "100644", id: f.two }]);
  rmSync(join(dir, "objects", f.cutSub.slice(0, 2), f.cutSub.slice(2)));
  expect([await refused(() => snapshotFiles(reader(), f.cutRoot, () => true)), await refused(() => snapshotFiles(reader(), f.cutRoot, (path) => path === "kept")), await refused(() => snapshotFiles(reader(), f.cutSub, () => true))])
    .toEqual(["missing-object", "missing-object", "missing-object"]);
  // A blob in a tree's place is not a tree either.
  expect(await refused(() => snapshotFiles(reader(), f.one, () => true))).toBe("wrong-type");
});
