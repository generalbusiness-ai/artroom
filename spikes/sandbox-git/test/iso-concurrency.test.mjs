// Review 5fc820a6, finding P1: two lands in one isolate must each merge the
// candidate they asked for. Network fetch and push are replaced; merge, object
// creation and the in-memory filesystem are real.
//
// Deterministic interleaving: the first merge waits until a second merge starts
// (or 300 ms pass). Without serialization and per-request refs, B overwrites the
// shared candidate ref while A waits, and A merges B. With them, B cannot start.
import { test } from "node:test";
import assert from "node:assert/strict";
import git from "isomorphic-git";
import { op } from "../src/iso-op.ts";

const who = { name: "t", email: "t@invalid", timestamp: 1_000_000_000, timezoneOffset: 0 };
const env = { ARTIFACTS_HOST: "test.invalid", ARTIFACTS_NAMESPACE: "ns" };

async function fixture(fs, gitdir) {
	const blob = (text) => git.writeBlob({ fs, gitdir, blob: new TextEncoder().encode(text) });
	const tree = async (files) =>
		git.writeTree({ fs, gitdir, tree: await Promise.all(files.map(async (path) =>
			({ mode: "100644", path, oid: await blob(path + "\n"), type: "blob" }))) });
	const commit = async (files, parent, message) =>
		git.writeCommit({ fs, gitdir, commit: { tree: await tree(files), parent, author: who, committer: who, message } });
	const root = await commit(["root.txt"], [], "root");
	return {
		main: await commit(["root.txt", "main.txt"], [root], "main"),
		"cand/a": await commit(["root.txt", "a.txt"], [root], "a"),
		"cand/b": await commit(["root.txt", "b.txt"], [root], "b"),
	};
}

function fakeNet() {
	const fixtures = new WeakMap();
	const events = [];
	const pushed = [];
	let merges = 0;
	let secondMergeStarted;
	const second = new Promise((r) => (secondMergeStarted = r));
	return {
		events, pushed,
		net: {
			async fetch({ fs, gitdir, ref }) {
				if (!fixtures.has(fs)) fixtures.set(fs, await fixture(fs, gitdir));
				events.push(`fetch ${ref}`);
				return { fetchHead: fixtures.get(fs)[ref] };
			},
			async merge(args) {
				const n = ++merges;
				events.push(`merge ${n} start`);
				if (n === 2) secondMergeStarted();
				if (n === 1) await Promise.race([second, new Promise((r) => setTimeout(r, 300))]);
				const out = await git.merge(args);
				events.push(`merge ${n} end`);
				return out;
			},
			async push({ fs, gitdir, ref, remoteRef, onPrePush }) {
				await onPrePush?.({});
				pushed.push({ remoteRef, oid: await git.resolveRef({ fs, gitdir, ref }), fs, gitdir });
				events.push("push");
				return { ok: true, refs: { [remoteRef]: { ok: true } } };
			},
		},
	};
}

async function filesOf(fs, gitdir, commitOid) {
	const { commit } = await git.readCommit({ fs, gitdir, oid: commitOid });
	const { tree } = await git.readTree({ fs, gitdir, oid: commit.tree });
	return { parents: commit.parent, files: tree.map((e) => e.path).sort() };
}

test("concurrent lands in one isolate each merge their own candidate", async () => {
	const { net, events, pushed } = fakeNet();
	const req = { op: "land", remote: "https://test.invalid/git/ns/concurrency.git", token: "t", base: "main" };
	// Create the shared cached repo first, so both lands use it.
	const warm = await op({ ...req, op: "preview", head: "cand/a" }, env, { ...net, merge: (a) => git.merge(a) });
	assert.equal(warm.clean, true);
	events.length = 0;

	const a = op({ ...req, head: "cand/a" }, env, net);
	while (!events.includes("merge 1 start")) await new Promise((r) => setTimeout(r, 1));
	const b = op({ ...req, head: "cand/b" }, env, net);
	const [ra, rb] = await Promise.all([a, b]);

	for (const [r, cand, file, other] of [[ra, "cand/a", "a.txt", "b.txt"], [rb, "cand/b", "b.txt", "a.txt"]]) {
		assert.equal(r.outcome, "landed", JSON.stringify(r));
		assert.ok(r.commit && r.expect, "land response names the commit and the expected base");
		const { fs, gitdir } = pushed[0];
		const { parents, files } = await filesOf(fs, gitdir, r.commit);
		assert.deepEqual(parents, [r.baseSha, r.headSha], `${cand}: parents`);
		assert.equal(r.expect, r.baseSha);
		const want = (await net.fetch({ fs, gitdir, ref: cand })).fetchHead;
		assert.equal(r.headSha, want, `${cand}: response head`);
		assert.ok(files.includes(file) && files.includes("main.txt"), `${cand}: tree has ${file} and main.txt`);
		assert.ok(!files.includes(other), `${cand}: tree must not have ${other}`);
		assert.ok(pushed.some((p) => p.oid === r.commit), `${cand}: the pushed commit is this land's commit`);
	}
	// B did not start until A finished.
	const order = events.filter((e) => !e.startsWith("fetch"));
	assert.deepEqual(order, ["merge 1 start", "merge 1 end", "push", "merge 2 start", "merge 2 end", "push"]);
});

test("a land that fails before pushing is an error, and names its expected base", async () => {
	const { net } = fakeNet();
	const expect = "0".repeat(40);
	const r = await op({ op: "land", remote: "https://test.invalid/git/ns/fail-fetch.git", token: "t", base: "main",
		head: "cand/a", expect }, env, { ...net, fetch: async () => { throw new Error("connection refused"); } });
	assert.equal(r.outcome, "error");
	assert.equal(r.landed, false);
	assert.equal(r.expect, expect);
	assert.equal(r.commit, null);
});

test("a land whose push fails after sending began is unknown, and names its commit", async () => {
	const { net } = fakeNet();
	const r = await op({ op: "land", remote: "https://test.invalid/git/ns/lost.git", token: "t", base: "main",
		head: "cand/a" }, env, { ...net, push: async ({ onPrePush }) => {
			await onPrePush?.({});
			throw new TypeError("Network connection lost");
		} });
	assert.equal(r.outcome, "unknown");
	assert.equal(r.landed, false);
	assert.equal(r.expect, r.baseSha);
	assert.match(String(r.commit), /^[0-9a-f]{40}$/);
});
