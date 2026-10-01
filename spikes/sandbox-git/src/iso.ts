// Comparison Worker: the same preview and land with isomorphic-git in a plain
// Worker, with no container. The logic is in iso-op.ts.
//
// POST /op, header `x-spike-key`, body:
//   { op: "preview" | "land", remote, token, base, head, expect?, fresh? }

import { op, type IsoEnv, type IsoRequest } from "./iso-op.ts";

interface Env extends IsoEnv {
	SPIKE_KEY: string;
}

const TOKEN_RE = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const redact = (s: string) => s.replace(TOKEN_RE, "<token>");

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (request.method !== "POST" || url.pathname !== "/op") return new Response("Not found", { status: 404 });
		if (!env.SPIKE_KEY || request.headers.get("x-spike-key") !== env.SPIKE_KEY) {
			return new Response("Forbidden", { status: 403 });
		}
		const t = Date.now();
		try {
			const res = await op((await request.json()) as IsoRequest, env);
			return Response.json({ ...res, workerMs: Date.now() - t });
		} catch (e) {
			return Response.json({ ok: false, error: redact(String((e as any)?.stack ?? e)).slice(0, 1500),
				workerMs: Date.now() - t }, { status: 500 });
		}
	},
};
