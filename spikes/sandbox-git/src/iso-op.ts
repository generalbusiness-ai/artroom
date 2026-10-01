// Preview and land with isomorphic-git and an in-memory filesystem. No container.
//
// Concurrency (review 5fc820a6, finding P1): requests for the same remote share
// one cached in-memory repo. They are serialized per remote, and each request
// also uses its own refs, so a request can only merge the commits it fetched.
// Before a land pushes, it reads its merge commit back and checks its parents.

import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import { MemoryFS } from "./memory-fs.ts";
import { classifyIsoPush } from "./push-outcome.ts";

export interface IsoEnv {
	ARTIFACTS_HOST: string;
	ARTIFACTS_NAMESPACE: string;
}

export type IsoRequest = {
	op: "preview" | "land";
	remote: string;
	token: string;
	base: string;
	head: string;
	expect?: string;
	fresh?: boolean;
};

// The network calls, replaceable in tests. Merge stays real.
export type IsoNet = {
	fetch: typeof git.fetch;
	push: typeof git.push;
	merge: typeof git.merge;
};

const defaultNet: IsoNet = {
	fetch: (args) => git.fetch(args),
	push: (args) => git.push(args),
	merge: (args) => git.merge(args),
};

const TOKEN_RE = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const REF_RE = /^[A-Za-z0-9._\/-]{1,200}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const redact = (s: string) => s.replace(TOKEN_RE, "<token>");
const who = { name: "artroom", email: "room@artroom.invalid" };
const gitdir = "/repo.git";

// One in-memory bare repo per remote, kept while the isolate lives.
const repos = new Map<string, { fs: MemoryFS; cache: object }>();
// The tail of each remote's queue of operations.
const queues = new Map<string, Promise<unknown>>();
let requests = 0;

export function op(req: IsoRequest, env: IsoEnv, net: IsoNet = defaultNet): Promise<Record<string, unknown>> {
	let remote: URL;
	try {
		remote = new URL(req.remote);
	} catch {
		return Promise.resolve(landFields(req, { ok: false, error: "bad remote" }, "error"));
	}
	if (remote.protocol !== "https:" || remote.hostname !== env.ARTIFACTS_HOST ||
		!remote.pathname.startsWith(`/git/${env.ARTIFACTS_NAMESPACE}/`) || remote.username || remote.password) {
		return Promise.resolve(landFields(req, { ok: false, error: "remote not allowed" }, "error"));
	}
	if (!REF_RE.test(req.base) || !REF_RE.test(req.head)) return Promise.resolve(landFields(req, { ok: false, error: "bad ref" }, "error"));
	if (req.expect && !SHA_RE.test(req.expect)) return Promise.resolve(landFields(req, { ok: false, error: "bad expect" }, "error"));
	const key = remote.href;
	const phase = { pushing: false };
	const run = (queues.get(key) ?? Promise.resolve()).then(async () => {
		try {
			return landFields(req, await locked(req, remote, net, phase), "error");
		} catch (e) {
			if (req.op !== "land") throw e;
			// A failure once the push has started may have landed.
			return landFields(req, { ok: false, error: redact(String((e as any)?.message ?? e)) },
				phase.pushing ? "unknown" : "error");
		}
	});
	queues.set(key, run.catch(() => undefined));
	return run;
}

// Every land response says what happened (`outcome`), the base it expected and
// the integration commit (null if none was made). A result without an outcome
// is a failure before the push: `fallback` says which kind.
function landFields(req: IsoRequest, res: Record<string, unknown>, fallback: "error" | "unknown") {
	if (req.op !== "land") return res;
	return { outcome: fallback, landed: false, refused: null, expect: req.expect ?? null, commit: null, ...res };
}

async function locked(req: IsoRequest, remote: URL, net: IsoNet, phase: { pushing: boolean }):
	Promise<Record<string, unknown>> {
	const t0 = Date.now();
	const headers = { Authorization: `Bearer ${req.token}` };
	let entry = req.fresh ? undefined : repos.get(remote.href);
	const sync = entry ? "fetch" : "clone";
	if (!entry) {
		entry = { fs: new MemoryFS(), cache: {} };
		await git.init({ fs: entry.fs, gitdir, bare: true, defaultBranch: "main" });
		await git.addRemote({ fs: entry.fs, gitdir, remote: "origin", url: remote.href });
		repos.set(remote.href, entry);
	}
	const { fs, cache } = entry;
	// Refs that belong to this request only.
	const ns = `refs/spike/r${++requests}`;
	const refs = { base: `${ns}/base`, head: `${ns}/head`, land: `${ns}/land` };
	try {
		const tf = Date.now();
		const shas: string[] = [];
		for (const ref of [req.base, req.head]) {
			const r = await net.fetch({
				fs, http, gitdir, cache, remote: "origin", ref, singleBranch: true, tags: false, headers,
			});
			if (!r.fetchHead || !SHA_RE.test(r.fetchHead)) return { ok: false, error: `fetch ${ref}: no head` };
			shas.push(r.fetchHead);
		}
		const fetchMs = Date.now() - tf;
		const [baseSha, headSha] = shas;
		await git.writeRef({ fs, gitdir, ref: refs.base, value: baseSha, force: true });
		await git.writeRef({ fs, gitdir, ref: refs.head, value: headSha, force: true });

		const tm = Date.now();
		let clean = true;
		let conflicts: string[] = [];
		let commit: string | undefined;
		let tree: string | undefined;
		try {
			const m = await net.merge({
				fs, gitdir, cache, ours: refs.base, theirs: refs.head,
				fastForward: false, abortOnConflict: true, noUpdateBranch: true,
				dryRun: req.op === "preview",
				message: `Land ${req.head} into ${req.base}`, author: who, committer: who,
			});
			commit = m.oid;
			tree = m.tree;
		} catch (e: any) {
			if (e?.code !== "MergeConflictError") throw e;
			clean = false;
			conflicts = e.data?.filepaths ?? [];
		}
		const mergeMs = Date.now() - tm;
		const preview = { baseSha, headSha, clean, conflicts };
		const timing = { sync, fetchMs, mergeMs };
		if (req.op === "preview") return { ok: true, ...preview, tree, timing: { ...timing, totalMs: Date.now() - t0 } };

		// land. isomorphic-git has no --force-with-lease: check the expectation,
		// then push without force, so only a fast-forward from the fetched base lands.
		const expect = req.expect ?? baseSha;
		const target = `refs/heads/${req.base}`;
		const refusal = (refused: string) => ({
			ok: true, outcome: "rejected", landed: false, refused, expect, commit: null, ...preview, timing,
		});
		if (baseSha !== expect) return refusal("main-moved");
		if (!clean || !commit) return refusal("conflict");
		const made = await git.readCommit({ fs, gitdir, oid: commit });
		const parents = made.commit.parent;
		if (parents.length !== 2 || parents[0] !== baseSha || parents[1] !== headSha) {
			return { ok: false, outcome: "error", landed: false, error: "merge commit has the wrong parents",
				expect, commit, parents, ...preview, timing };
		}
		await git.writeRef({ fs, gitdir, ref: refs.land, value: commit, force: true });
		const tp = Date.now();
		let sent = false;
		phase.pushing = true;
		let result: any;
		let err: unknown;
		try {
			result = await net.push({
				fs, http, gitdir, url: remote.href, headers,
				ref: refs.land, remoteRef: target, force: false,
				onPrePush: () => { sent = true; return true; },
			});
		} catch (e) {
			err = e;
		}
		const out = classifyIsoPush(result, err, sent, target);
		return {
			ok: true, outcome: out.outcome, landed: out.outcome === "landed",
			refused: out.outcome === "rejected" ? out.reason : null,
			expect, commit, tree: made.commit.tree, ...preview,
			pushOut: redact(out.detail),
			timing: { ...timing, pushMs: Date.now() - tp, totalMs: Date.now() - t0 },
		};
	} finally {
		for (const ref of Object.values(refs)) {
			await git.deleteRef({ fs, gitdir, ref }).catch(() => undefined);
		}
	}
}
