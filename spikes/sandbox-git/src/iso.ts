// Comparison: the same preview and land with isomorphic-git in a plain Worker.
// No container. Objects live in an in-memory filesystem, cached per isolate
// unless the request sets `fresh: true`.
//
// POST /op, header `x-spike-key`, body:
//   { op: "preview" | "land", remote, token, base, head, expect?, fresh? }

import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import { MemoryFS } from "./memory-fs";

interface Env {
	SPIKE_KEY: string;
	ARTIFACTS_HOST: string;
	ARTIFACTS_NAMESPACE: string;
}

type OpRequest = {
	op: "preview" | "land";
	remote: string;
	token: string;
	base: string;
	head: string;
	expect?: string;
	fresh?: boolean;
};

const TOKEN_RE = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const REF_RE = /^[A-Za-z0-9._\/-]{1,200}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const redact = (s: string) => s.replace(TOKEN_RE, "<token>");
const who = { name: "artroom", email: "room@artroom.invalid" };

// One in-memory bare repo per remote, kept while the isolate lives.
const repos = new Map<string, { fs: MemoryFS; cache: object }>();

async function op(req: OpRequest, env: Env) {
	const t0 = Date.now();
	const remote = new URL(req.remote);
	if (remote.protocol !== "https:" || remote.hostname !== env.ARTIFACTS_HOST ||
		!remote.pathname.startsWith(`/git/${env.ARTIFACTS_NAMESPACE}/`) || remote.username || remote.password) {
		return { ok: false, error: "remote not allowed" };
	}
	if (!REF_RE.test(req.base) || !REF_RE.test(req.head)) return { ok: false, error: "bad ref" };
	if (req.expect && !SHA_RE.test(req.expect)) return { ok: false, error: "bad expect" };

	const headers = { Authorization: `Bearer ${req.token}` };
	const gitdir = "/repo.git";
	let entry = req.fresh ? undefined : repos.get(remote.href);
	const sync = entry ? "fetch" : "clone";
	if (!entry) {
		entry = { fs: new MemoryFS(), cache: {} };
		await git.init({ fs: entry.fs, gitdir, bare: true, defaultBranch: "main" });
		await git.addRemote({ fs: entry.fs, gitdir, remote: "origin", url: remote.href });
		repos.set(remote.href, entry);
	}
	const { fs, cache } = entry;

	const tf = Date.now();
	const shas: string[] = [];
	for (const ref of [req.base, req.head]) {
		const r = await git.fetch({
			fs, http, gitdir, cache, remote: "origin", ref, singleBranch: true, tags: false, headers,
		});
		shas.push(r.fetchHead!);
	}
	const fetchMs = Date.now() - tf;
	const [baseSha, headSha] = shas;
	await git.writeRef({ fs, gitdir, ref: "refs/heads/spike-base", value: baseSha, force: true });
	await git.writeRef({ fs, gitdir, ref: "refs/heads/spike-head", value: headSha, force: true });

	const tm = Date.now();
	let clean = true;
	let conflicts: string[] = [];
	let commit: string | undefined;
	try {
		const m = await git.merge({
			fs, gitdir, cache, ours: "spike-base", theirs: "spike-head",
			fastForward: false, abortOnConflict: true, noUpdateBranch: true,
			dryRun: req.op === "preview",
			message: `Land ${req.head} into ${req.base}`, author: who, committer: who,
		});
		commit = m.oid;
	} catch (e: any) {
		if (e?.code !== "MergeConflictError") throw e;
		clean = false;
		conflicts = e.data?.filepaths ?? [];
	}
	const mergeMs = Date.now() - tm;
	const preview = { baseSha, headSha, clean, conflicts };
	const timing = { sync, fetchMs, mergeMs };
	if (req.op === "preview") return { ok: true, ...preview, timing: { ...timing, totalMs: Date.now() - t0 } };

	// land: isomorphic-git has no --force-with-lease. Check the expectation,
	// then push without force, so only a fast-forward from the fetched main lands.
	const expect = req.expect ?? baseSha;
	if (baseSha !== expect) return { ok: true, landed: false, refused: "main-moved", ...preview, timing };
	if (!clean || !commit) return { ok: true, landed: false, refused: "conflict", ...preview, timing };
	await git.writeRef({ fs, gitdir, ref: "refs/heads/spike-land", value: commit, force: true });
	const tp = Date.now();
	let push: any;
	try {
		push = await git.push({
			fs, http, gitdir, url: remote.href, headers,
			ref: "refs/heads/spike-land", remoteRef: `refs/heads/${req.base}`, force: false,
		});
	} catch (e: any) {
		return { ok: true, landed: false, refused: "push", pushErr: redact(String(e)), ...preview,
			timing: { ...timing, pushMs: Date.now() - tp, totalMs: Date.now() - t0 } };
	}
	return {
		ok: true, landed: !!push?.ok, refused: push?.ok ? null : "push", commit, ...preview,
		pushOut: redact(JSON.stringify(push?.refs ?? {})),
		timing: { ...timing, pushMs: Date.now() - tp, totalMs: Date.now() - t0 },
	};
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (request.method !== "POST" || url.pathname !== "/op") return new Response("Not found", { status: 404 });
		if (!env.SPIKE_KEY || request.headers.get("x-spike-key") !== env.SPIKE_KEY) {
			return new Response("Forbidden", { status: 403 });
		}
		const t = Date.now();
		try {
			const res = await op((await request.json()) as OpRequest, env);
			return Response.json({ ...res, workerMs: Date.now() - t });
		} catch (e) {
			return Response.json({ ok: false, error: redact(String((e as any)?.stack ?? e)).slice(0, 1500),
				workerMs: Date.now() - t }, { status: 500 });
		}
	},
};
