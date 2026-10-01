// artroom-spike-room-core: HTTP front for the RoomSpike Durable Object.
//   POST /r/:room/setup          body: policy JSON, or empty for the bundled policy
//   POST /r/:room/act            body: {act, sig}
//   GET  /r/:room/diff?from=&to=&cached=1
//   GET  /r/:room/explain?seq=N  replays the act's recorded rule inputs
//   GET  /r/:room/log?since=N
//   POST /r/:room/bench          body: {op, n, ...}; see RoomSpike.bench
import { RoomSpike } from "./room";
import { compile, evaluate } from "./profile";
import defaultPolicy from "./policy.json";
export { RoomSpike };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    // CPU cross-check: run the same work in the Worker isolate, where the
    // tail's cpuTime field reports it. Each request does `inner` iterations.
    if (url.pathname === "/w/bench") {
      const op = url.searchParams.get("op");
      const inner = Number(url.searchParams.get("inner") ?? 1);
      const size = Number(url.searchParams.get("size") ?? 100);
      const g = url.searchParams.get("guard") ?? "true";
      const guard = g === "true" ? true : g === "false" ? false : (g as "steps" | "memo");
      let out: unknown = null;
      if (op === "compile") for (let i = 0; i < inner; i++) for (const r of (defaultPolicy as any).rules) compile(r.expr, false);
      if (op === "patho") {
        const changed = Array.from({ length: size }, (_, i) => `src/dir${i % 10}/file${i}.ts`);
        const c = compile("$count(changed[$count($$.changed[$count($$.changed[$ = $$.changed[0]]) > 0]) > 0])");
        for (let i = 0; i < inner; i++) out = await evaluate(c, { changed }, { guard }).then((r) => r.value, (e) => e.code ?? String(e));
      }
      return Response.json({ op, inner, size, guard, out });
    }
    const m = url.pathname.match(/^\/r\/([A-Za-z0-9_-]{1,64})\/(setup|act|diff|explain|log|bench)$/);
    if (!m) return new Response("artroom spike: room core\n", { status: 404 });
    const [, room, op] = m;
    const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
    const t = Date.now();
    try {
      let result: unknown;
      const body = req.method === "POST" ? await req.text() : "";
      if (op === "setup") result = await stub.setup(body ? JSON.parse(body) : null);
      else if (op === "act") result = await stub.act(JSON.parse(body));
      else if (op === "diff") result = await stub.diff(url.searchParams.get("from")!, url.searchParams.get("to")!, url.searchParams.get("cached") === "1", Number(url.searchParams.get("limit") ?? Infinity));
      else if (op === "explain") result = await stub.explain(Number(url.searchParams.get("seq")));
      else if (op === "log") result = JSON.parse(await stub.log(Number(url.searchParams.get("since") ?? 0)));
      else result = await stub.bench(JSON.parse(body));
      return Response.json({ result, worker_ms: Date.now() - t, colo: (req as any).cf?.colo ?? null });
    } catch (e: any) {
      return Response.json({ error: e?.message ?? JSON.stringify(e), worker_ms: Date.now() - t }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
