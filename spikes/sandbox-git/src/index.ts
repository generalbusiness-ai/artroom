// Spike: merge preview and landing with real git in a Cloudflare container.
//
// POST /op with a JSON body and the header `x-spike-key: <SPIKE_KEY>`:
//   { op: "preview" | "land" | "destroy" | "info",
//     box: "<sandbox name>", remote, token, base, head,
//     expect?: "<sha main must still have>", instance?: "lite" | "basic" | ... }
//
// The repo token never enters the container. The Durable Object registers an
// HTTPS intercept for the Artifacts host; the ArtifactsGateway entrypoint
// receives each git request, checks it, and adds `Authorization: Bearer`.

import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

interface Env {
	GITBOX: DurableObjectNamespace<GitBox>;
	SPIKE_KEY: string;
	ARTIFACTS_HOST: string;
	ARTIFACTS_NAMESPACE: string;
}

type GatewayProps = { host: string; repoPath: string; token: string; push: boolean };

type OpRequest = {
	op: "preview" | "land" | "destroy" | "info";
	box: string;
	remote?: string;
	token?: string;
	base?: string;
	head?: string;
	expect?: string;
	instance?: string;
	pushAt?: number; // land only: wait until this epoch ms before pushing (race test)
};

const CA = "/etc/cloudflare/certs/cloudflare-containers-ca.crt";
const INACTIVITY_MS = 10 * 60 * 1000;
const TOKEN_RE = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const REF_RE = /^[A-Za-z0-9._\/-]{1,200}$/;
const SHA_RE = /^[0-9a-f]{40}$/;

const redact = (s: string) => s.replace(TOKEN_RE, "<token>");

// Adds the repo token to git's requests for one repo. Everything else is refused.
export class ArtifactsGateway extends WorkerEntrypoint<Env, GatewayProps> {
	async fetch(request: Request): Promise<Response> {
		const p = this.ctx.props;
		const url = new URL(request.url);
		const inRepo = url.pathname.startsWith(p.repoPath + "/");
		const isPush =
			url.pathname.endsWith("/git-receive-pack") ||
			url.searchParams.get("service") === "git-receive-pack";
		if (url.hostname !== p.host || !inRepo || (isPush && !p.push)) {
			return new Response("Forbidden by gateway", { status: 403 });
		}
		const headers = new Headers(request.headers);
		headers.set("Authorization", `Bearer ${p.token}`);
		return fetch(new Request(request, { headers }));
	}
}

type Run = { code: number; out: string; err: string; ms: number };

export class GitBox extends DurableObject<Env> {
	private chain: Promise<unknown> = Promise.resolve();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		const c = ctx.container;
		if (c?.running) {
			void ctx.blockConcurrencyWhile(() => c.setInactivityTimeout(INACTIVITY_MS));
		}
	}

	// One operation at a time per sandbox: they share one git directory.
	async op(req: OpRequest): Promise<Record<string, unknown>> {
		const next = this.chain.then(() => this.doOp(req));
		this.chain = next.catch(() => undefined);
		return next;
	}

	private async run(argv: string[], cwd?: string): Promise<Run> {
		const t = Date.now();
		const proc = await this.ctx.container!.exec(argv, {
			cwd,
			env: {
				HOME: "/root",
				GIT_TERMINAL_PROMPT: "0",
				GIT_SSL_CAINFO: CA,
				GIT_AUTHOR_NAME: "artroom",
				GIT_AUTHOR_EMAIL: "room@artroom.invalid",
				GIT_COMMITTER_NAME: "artroom",
				GIT_COMMITTER_EMAIL: "room@artroom.invalid",
			},
		});
		const o = await proc.output();
		const dec = new TextDecoder();
		return {
			code: o.exitCode,
			out: dec.decode(o.stdout).trim(),
			err: redact(dec.decode(o.stderr)).trim().slice(-2000),
			ms: Date.now() - t,
		};
	}

	private async ensure(instance?: string): Promise<{ cold: boolean; startMs: number }> {
		const c = this.ctx.container;
		if (!c) throw new Error("no container binding");
		const t = Date.now();
		let cold = false;
		if (!c.running) {
			cold = true;
			const opts: Record<string, unknown> = {
				image: (c as any).images.git,
				entrypoint: ["sleep", "infinity"],
				enableInternet: false,
			};
			if (instance) opts.instance = instance;
			c.start(opts as any);
			await c.setInactivityTimeout(INACTIVITY_MS);
		}
		// exec() waits for a container that is still starting.
		const r = await this.run(["true"]);
		if (r.code !== 0) throw new Error(`container not ready: ${r.err}`);
		return { cold, startMs: Date.now() - t };
	}

	private async doOp(req: OpRequest): Promise<Record<string, unknown>> {
		const t0 = Date.now();
		const c = this.ctx.container!;
		if (req.op === "destroy") {
			const was = c.running;
			if (was) await c.destroy("spike reset");
			return { ok: true, wasRunning: was, ms: Date.now() - t0 };
		}
		const { cold, startMs } = await this.ensure(req.instance);
		if (req.op === "info") {
			const v = await this.run(["git", "--version"]);
			const n = await this.run(["nproc"]);
			const m = await this.run(["sh", "-c", "grep MemTotal /proc/meminfo"]);
			return { ok: true, cold, startMs, git: v.out, nproc: n.out, mem: m.out };
		}

		// Validate the request before the container sees any of it.
		const remote = new URL(req.remote!);
		const nsPrefix = `/git/${this.env.ARTIFACTS_NAMESPACE}/`;
		if (remote.protocol !== "https:" || remote.hostname !== this.env.ARTIFACTS_HOST ||
			!remote.pathname.startsWith(nsPrefix) || !remote.pathname.endsWith(".git") ||
			remote.username || remote.password) {
			return { ok: false, error: "remote not allowed" };
		}
		const base = req.base!, head = req.head!;
		if (!REF_RE.test(base) || !REF_RE.test(head) || base.includes("..") || head.includes("..")) {
			return { ok: false, error: "bad ref" };
		}
		if (req.expect && !SHA_RE.test(req.expect)) return { ok: false, error: "bad expect" };

		// Hand the gateway this request's token. Registering again replaces the handler.
		const ti = Date.now();
		const gw = (this.ctx as any).exports.ArtifactsGateway({
			props: { host: remote.hostname, repoPath: remote.pathname, token: req.token!, push: req.op === "land" },
		});
		await c.interceptOutboundHttps(remote.hostname, gw);
		const interceptMs = Date.now() - ti;

		// One bare repo per remote. First use is a clone; later uses fetch.
		const dir = "/work/" + remote.pathname.slice(nsPrefix.length).replace(/[^A-Za-z0-9._-]/g, "_");
		const exists = (await this.run(["test", "-d", dir + "/objects"])).code === 0;
		if (!exists) {
			const i = await this.run(["git", "init", "-q", "--bare", dir]);
			if (i.code !== 0) return { ok: false, error: "init", detail: i.err };
		}
		const fetch = await this.run([
			"git", "-C", dir, "fetch", "-q", "--no-tags", "--force", remote.href,
			`+refs/heads/${base}:refs/remotes/o/${base}`,
			`+refs/heads/${head}:refs/remotes/o/${head}`,
		]);
		if (fetch.code !== 0) return { ok: false, error: "fetch", detail: fetch.err, fetchMs: fetch.ms };
		const shas = await this.run(["git", "-C", dir, "rev-parse", `refs/remotes/o/${base}`, `refs/remotes/o/${head}`]);
		const [baseSha, headSha] = shas.out.split("\n");

		const mt = await this.run([
			"git", "-C", dir, "merge-tree", "--write-tree", "--name-only", "--no-messages", baseSha, headSha,
		]);
		if (mt.code !== 0 && mt.code !== 1) return { ok: false, error: "merge-tree", detail: mt.err };
		const lines = mt.out.split("\n").filter(Boolean);
		const tree = lines[0];
		const conflicts = lines.slice(1);
		const timing = {
			cold, startMs, interceptMs, sync: exists ? "fetch" : "clone",
			fetchMs: fetch.ms, mergeMs: mt.ms,
		};
		const preview = { baseSha, headSha, clean: mt.code === 0, conflicts };

		if (req.op === "preview") {
			return { ok: true, ...preview, timing: { ...timing, totalMs: Date.now() - t0 } };
		}

		// land
		const expect = req.expect ?? baseSha;
		if (baseSha !== expect) {
			return { ok: true, landed: false, refused: "main-moved", ...preview,
				timing: { ...timing, totalMs: Date.now() - t0 } };
		}
		if (!preview.clean) {
			return { ok: true, landed: false, refused: "conflict", ...preview,
				timing: { ...timing, totalMs: Date.now() - t0 } };
		}
		const ct = await this.run([
			"git", "-C", dir, "commit-tree", tree, "-p", baseSha, "-p", headSha,
			"-m", `Land ${head} into ${base}`,
		]);
		if (ct.code !== 0) return { ok: false, error: "commit-tree", detail: ct.err };
		const commit = ct.out;
		let waitedMs = 0;
		if (req.pushAt) {
			waitedMs = Math.max(0, req.pushAt - Date.now());
			if (waitedMs > 0 && waitedMs < 30000) await new Promise((r) => setTimeout(r, waitedMs));
		}
		const push = await this.run([
			"git", "-C", dir, "push", "--porcelain",
			`--force-with-lease=refs/heads/${base}:${expect}`,
			remote.href, `${commit}:refs/heads/${base}`,
		]);
		return {
			ok: true, landed: push.code === 0, refused: push.code === 0 ? null : "lease",
			commit, ...preview, pushOut: push.out, pushErr: push.err,
			timing: { ...timing, commitMs: ct.ms, waitedMs, pushMs: push.ms, totalMs: Date.now() - t0 },
		};
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (request.method !== "POST" || url.pathname !== "/op") {
			return new Response("Not found", { status: 404 });
		}
		if (!env.SPIKE_KEY || request.headers.get("x-spike-key") !== env.SPIKE_KEY) {
			return new Response("Forbidden", { status: 403 });
		}
		const req = (await request.json()) as OpRequest;
		if (!req.box || !/^[A-Za-z0-9_-]{1,64}$/.test(req.box)) {
			return Response.json({ ok: false, error: "bad box" }, { status: 400 });
		}
		const t = Date.now();
		try {
			const stub = env.GITBOX.getByName(req.box);
			const res = await stub.op(req);
			return Response.json({ ...res, workerMs: Date.now() - t });
		} catch (e) {
			return Response.json({ ok: false, error: redact(String(e)), workerMs: Date.now() - t }, { status: 500 });
		}
	},
};
