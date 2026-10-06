import { afterAll, expect, test } from "vitest";
import type { FactRef } from "@generalbusiness/artroom-contract";
import { factOfRefName, factOfText, factRefName, factText } from "@generalbusiness/artroom-bytes";
import { bare, blob, cleanup, git, tree } from "./support/repo.ts";

afterAll(cleanup);

// The check that the scope contract's section 3 owes with row I3-46: the real `git` is asked about each name. A local repository, not
// a host. The fixed parts are made up: `refs/artroom/receipts/` is the contract's example, and no version of a platform definition
// states a part yet. The word `receipt` of the commit's line is made up too: the authority note's rows state the word.
const HEX = "0123456789abcdef".repeat(4);
const F: FactRef = { at: { scope: `sc_${"b".repeat(51)}a`, inc: `in_${"c".repeat(25)}a`, kind: "lane" }, seq: 41, hash: `sha256:${HEX}` };
const PARTS: readonly (readonly [string, string])[] = [
  ["refs/artroom/receipts/", ""],
  ["refs/", ""],
  ["refs/artroom/", "/head"],
  ["refs/a-b/0/", "/x-1/y"],
];

test("git check-ref-format accepts every name of the form, with the hash of all zeros, of all f and of mixed digits", () => {
  const dir = bare();
  for (const [before, after] of PARTS) {
    for (const hash of [F.hash, `sha256:${"0".repeat(64)}`, `sha256:${"f".repeat(64)}`]) {
      const name = factRefName(before, hash, after)!;
      // Exit 0 and no output. A refused name throws here, with Git's exit status 1.
      expect(git(dir, ["check-ref-format", name]), name).toBe("");
    }
  }
  // The control of the check itself: Git refuses the name that the form leaves out, a hash with its prefix.
  expect(() => git(dir, ["check-ref-format", `refs/artroom/receipts/sha256:${HEX}`])).toThrow();
});

test("18.48 cases 3 and 4: under the ref of a fact, a commit's line holds the fact's text, and a reader finds them equal from the repository alone", () => {
  const dir = bare();
  const name = factRefName("refs/artroom/receipts/", F.hash)!;
  const root = tree(dir, [`100644 blob ${blob(dir, "receipt\n")}\treceipt`]);
  const commit = git(dir, ["commit-tree", root], `A receipt\n\nreceipt ${factText(F)!}\n`);
  git(dir, ["update-ref", name, commit]);

  // The reader: Git lists the ref under the name of 86 bytes, and the commit that it names holds the line.
  expect(git(dir, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/artroom/"])).toBe(`${name} ${commit}`);
  expect(name.length).toBe(86);
  const line = git(dir, ["cat-file", "commit", commit]).split("\n").find((l) => l.startsWith("receipt "))!;
  const fact = factOfText(line.slice("receipt ".length));
  expect(fact).toEqual(F);
  expect(factOfRefName(name, "refs/artroom/receipts/")).toBe(fact!.hash);
  expect(name.split("/").at(-1)).toBe(fact!.hash.slice("sha256:".length));
});
