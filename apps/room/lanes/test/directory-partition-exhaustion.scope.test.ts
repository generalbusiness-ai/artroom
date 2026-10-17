import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { scopeIdOf } from "@generalbusiness/artroom-bytes";
import { PARTITION_COHORT as C } from "@generalbusiness/dap-platform";
import { namespace } from "../../../../packages/scope/src/namespace.ts";
import { SqliteStore } from "../../../../packages/scope/src/sqlite.ts";
import { wired } from "../../../../packages/scope/test/outside.ts";
import { net } from "./support/graph.ts";
import { room, rita, settle } from "./support/room.ts";

// Explicit COUNTER BOUNDARY storage fixture: only the Root's counter is
// set to999 before native creation. This is not a thousand-generation
// capacity or replay proof. The actual final birth, seal, native refusal
// and its result run normally. Git/clock/scheduler retain Room stand-ins.
test("native exhausted Root refusal returns to its sealing partition at the counter boundary", async () => {
  const r = await room({ partitioned: true, openPartition: false, rootBounds: { ...PROPOSED_BOUNDS, scopeEntries: 3012 }, roster: [] });
  const D = r.root, actual = namespace(env.PLATFORM).transport;
  const names: string[] = [], answers: unknown[] = [];
  wired.set(D.name, () => ({ transport: { send: async envelope => {
    if ("definition" in envelope.to && envelope.to.definition === C.partition) { const name = scopeIdOf(envelope.to); names.push(name); net.sized.set(name, { ...PROPOSED_BOUNDS, scopeEntries: 8 }); }
    const answer = await actual.send(envelope); answers.push({ class: envelope.message.class, answer }); return answer;
  } } }));
  try {
    await runInDurableObject(D.object, (_instance, storage) => {
      const store = new SqliteStore({ exec: (query, ...args) => storage.storage.sql.exec(query, ...args), transaction: work => storage.storage.transactionSync(work) });
      const control = store.item(0)!;
      store.putItem({ ...control, values: { ...control.values, generations: 999 } });
    });
    await D.restart();
    const opened = await D.did(rita, "open-partition", { expected: await D.expected({ repository: 0 }) });
    const P = await D.created(opened); await settle(...r.scopes, P);
    expect(await P.item(0)).toMatchObject({ values: { generation: 1000, base: 99900001 } });
    await P.did(rita, "seal", { on: 0, expected: await P.expected({ on: 0 }) });
    await settle(...r.scopes, P);
    // Join actual scheduled callbacks; no read-head retry, clock advance,
    // new policy or replacement request is used to obtain completion.
    for (let pass = 0; pass < 64; pass++) {
      let joined = 0;
      for (const node of [D, P]) joined += (await (node.stub as unknown as { awaitScheduledCallbacks(): Promise<{ callbacks: number }> }).awaitScheduledCallbacks()).callbacks;
      await settle(...r.scopes, P);
      if (joined === 0) break;
      if (pass === 63) throw new Error("native exhaustion fixture exceeded its callback bound");
    }
    const last = await D.stub.entry("a test reader", (await D.summary()).at.seq);
    expect(last).toMatchObject({ ok: true, value: { entry: { input: { type: "delivery", decision: "refused", reason: { code: "guard-failed", name: "root-exhausted" } } } } });
    expect(await P.item(0), JSON.stringify(answers)).toMatchObject({ state: "open", values: { sealed: true, handedOff: false, sealRefused: true } });
    expect(names).toHaveLength(1);
  } finally { wired.delete(D.name); for (const name of names) net.sized.delete(name); }
}, 60_000);
