import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Intent, ScopeRef, Seed } from "@generalbusiness/dap-contract";
import { intentDigest, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { deskDefinition, grantOf, keys, ticket, ticketDefinition, variant } from "@generalbusiness/dap-derive/testing";
import { namespace } from "../src/namespace.ts";
import { SqliteStore, Turns, Wakes, production } from "../src/index.ts";
import { measured, operationContext } from "../src/operational.ts";
import { controls } from "../src/testing.ts";
import type { MetricEnvironment } from "../src/operational.ts";
import type { MetricPoint } from "../src/metrics.ts";
import type { Delivered } from "@generalbusiness/dap-derive";
import { metricBindings, metricWiring, type TestScope } from "./worker.ts";
import type { Remote } from "./support.ts";
import { at, reader } from "./support.ts";

type Peer = Remote & { observed(...args: Parameters<TestScope["observed"]>): Promise<{ value: unknown; turn: boolean }>; dispatch(): Promise<number> };

// Invariant: operational failures cannot change a native answer, entry,
// outbox row or delivered message. These are two real SQLite namespaces on
// derive's made-up desk/ticket definitions. Clock, authority, readers and
// incarnation randomness are explicit test ports, not platform/provider proof.
test("absent, throwing, slow and SQL-faulted telemetry preserve native creation, dispatch and restart bytes", async () => {
  for (const mode of ["record", "throw", "slow", "entry-fault", "duty-fault"] as const) {
    const points: MetricPoint[] = [];
    const sink: MetricEnvironment = { DEPLOYMENT: "native-metrics-test", METRICS: { writeDataPoint: point => {
      if (mode === "throw") throw Error("scripted sink failure");
      if (mode === "slow") return new Promise(() => {});
      points.push(structuredClone(point));
    } } };
    const intent: Intent = { v: 1, to: null, actor: keys.rita.key, kind: "found", on: null, expected: {}, fields: { source: "a repository" }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) };
    const seed: Seed = { v: 1, kind: "directory", definition: deskDefinition.digest, creator: null, cause: intentDigest(intent), ordinal: 0 };
    const name = scopeIdOf(seed), founding = signIntent(intent, keys.rita.secret);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const worlds = [env.SCOPES, env.METRIC_CONTROL].map((binding, n) => {
      const packets: Delivered[] = [], replies: unknown[] = [];
      const ports = namespace(binding);
      const wire = (scope: string) => {
        const physical = binding.idFromName(scope).toString();
        controls(scope);
        metricBindings.set(physical, n === 0 ? {} : sink);
        metricWiring.set(physical, () => ({
          random: { bytes: size => new Uint8Array(size).fill(57) },
          resolver: ports.resolver, definitions: ports.definitions,
          transport: { send: async envelope => { await held; packets.push(structuredClone(envelope)); const reply = await ports.transport.send(envelope); replies.push(structuredClone(reply)); return reply; } },
        }));
        const object = binding.get(binding.idFromName(scope));
        return { object, peer: object as unknown as Peer };
      };
      const node = wire(name);
      return { ...node, wire, packets, replies, binding };
    });
    try {
      // Only the measured world has operational request/trace correlation.
      const identity = { request: "abcdef0123456789", trace: "abcdef0123456789abcdef0123456789" };
      const answers: { value: unknown; turn: boolean }[] = [];
      for (const [n, world] of worlds.entries()) {
        if (n === 1 && mode.endsWith("fault")) await runInDurableObject(world.object, (_instance, state) => {
          state.storage.sql.exec(`CREATE TRIGGER fail_operational BEFORE INSERT ON request_index WHEN NEW.${mode === "entry-fault" ? "seq" : "duty"} IS NOT NULL BEGIN SELECT RAISE(FAIL, 'scripted sidecar failure'); END`).toArray();
        });
        answers.push(await world.peer.observed("found", [founding, deskDefinition.declared, [ticketDefinition.declared]], n ? identity : { request: null, trace: null }));
      }
      expect(answers[1]).toEqual(answers[0]);
      const founded = answers[0]!.value as { answer: string; receipt: { fact: { at: ScopeRef } } };
      expect(founded.answer).toBe("accepted");
      const within = founded.receipt.fact.at;
      const asked = signIntent({ v: 1, to: within, actor: keys.rita.key, kind: "open-issue", on: null, expected: {}, fields: { title: "Operational isolation" }, idempotencyKey: "open", notAfter: at(60) }, keys.rita.secret);
      const grants = Object.values(keys).map(who => grantOf(who, within, Object.values(deskDefinition.declared.acts).map(a => a.grant)));
      const opened: { value: unknown; turn: boolean }[] = [];
      for (const [n, world] of worlds.entries()) opened.push(await world.peer.observed("submit", [asked, grants], n ? identity : { request: null, trace: null }));
      expect(opened[1]).toEqual(opened[0]);
      expect((opened[0]!.value as { answer: string }).answer).toBe("accepted");
      const history = await worlds[0]!.peer.history(reader);
      if (!history.ok) throw Error("No native parent history");
      const send = history.value.flatMap(row => row.entry.sends)[0]!;
      const child = scopeIdOf(send.to as Seed);
      const children = worlds.map(world => world.wire(child));
      release();
      // Join the actual dispatchers, without sleeps or carrying their messages.
      for (let round = 0; round < 8; round++) {
        const made = await Promise.all([...worlds, ...children].map(node => node.peer.dispatch()));
        if (made.every(n => n === 0)) break;
        if (round === 7) throw Error("Native paired worlds did not settle");
      }
      expect(worlds[0]!.packets.length).toBeGreaterThan(0);
      expect(worlds[1]!.packets).toEqual(worlds[0]!.packets);
      expect(worlds[1]!.replies).toEqual(worlds[0]!.replies);
      for (const pair of [worlds, children]) {
        const native = await Promise.all(pair.map(async node => ({ history: await node.peer.history(reader), outbox: await node.peer.outbox(reader) })));
        expect(native[1]).toEqual(native[0]);
        expect(JSON.stringify(native)).not.toContain(identity.request);
        for (const node of pair) await evictDurableObject(node.object);
        const restarted = await Promise.all(pair.map(async (node, i) => {
          const fresh = worlds[i]!.binding.get(node.object.id) as unknown as Peer;
          return { history: await fresh.history(reader), outbox: await fresh.outbox(reader) };
        }));
        expect(restarted).toEqual(native);
      }
      const correlation = await runInDurableObject(worlds[1]!.binding.get(worlds[1]!.object.id), (_instance, state) => state.storage.sql.exec("SELECT request,trace,seq,duty FROM request_index ORDER BY n").toArray());
      expect(correlation.every(row => row["request"] === identity.request && row["trace"] === identity.trace)).toBe(true);
      expect(correlation.some(row => row["seq"] !== null)).toBe(mode !== "entry-fault");
      expect(correlation.some(row => row["duty"] !== null)).toBe(mode !== "duty-fault");
      if (mode === "record" || mode.endsWith("fault")) {
        expect(points.some(p => p.blobs[0] === "turn" && p.blobs[3] === "rpc:acts" && p.blobs[8] === "accepted")).toBe(true);
        const losses = points.filter(p => p.blobs[0] === "metric-dropped");
        expect(losses.some(p => (p.doubles[1]! & 8) !== 0)).toBe(mode.endsWith("fault"));
      }
    } finally {
      release();
    }
  }
});

// Invariant: one actual alarm can settle more native duties than the AE cap
// without losing a native end or changing any entry/send. Routing replies,
// authority, clock and deterministic incarnations are labelled stand-ins.
test("an alarm settles 251 native requests with exact turn multiplicity inside the 250 point cap", async () => {
  const count = 251, points: MetricPoint[] = [];
  const definition = variant(ticket, def => { def.items.request.max = count; });
  const intent: Intent = { v: 1, to: null, actor: keys.rita.key, kind: "found", on: null, expected: {}, fields: { title: "A ticket", opener: keys.rita.member }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) };
  const seed: Seed = { v: 1, kind: "directory", definition: definition.digest, creator: null, cause: intentDigest(intent), ordinal: 0 };
  const name = scopeIdOf(seed), signed = signIntent(intent, keys.rita.secret), c = controls(name);
  c.bounds = { ...c.bounds, routingRefusals: 1 };
  const packets: Delivered[][] = [[], []];
  const worlds = [env.SCOPES, env.METRIC_CONTROL].map((binding, i) => {
    const id = binding.idFromName(name), key = id.toString();
    metricBindings.set(key, i === 0 ? {} : { DEPLOYMENT: "alarm-metrics-test", METRICS: { writeDataPoint: p => points.push(structuredClone(p)) } });
    metricWiring.set(key, () => ({ random: { bytes: size => new Uint8Array(size).fill(61) } }));
    return { binding, id, key, peer: binding.get(id) as unknown as Peer };
  });
  const founded = await worlds[0]!.peer.found(signed, definition.declared);
  expect(await worlds[1]!.peer.found(signed, definition.declared)).toEqual(founded);
  if (founded.answer !== "accepted") throw Error(`Native pressure fixture was not founded: ${JSON.stringify(founded)}`);
  const within = founded.receipt.fact.at;
  const grants = [grantOf(keys.rita, within, ["ask"])];
  const missing = { ...within, scope: scopeIdOf({ ...seed, ordinal: 1 }) };
  for (let n = 0; n < count; n++) {
    const ask = signIntent({ v: 1, to: within, actor: keys.rita.key, kind: "ask", on: null, expected: {}, fields: { desk: missing }, idempotencyKey: `ask-${n}`, notAfter: at(60) }, keys.rita.secret);
    const answer = await worlds[0]!.peer.submit(ask, grants);
    expect(answer).toMatchObject({ answer: "accepted" });
    expect(await worlds[1]!.peer.submit(ask, grants)).toEqual(answer);
  }
  points.length = 0;
  for (const [i, world] of worlds.entries()) {
    metricWiring.set(world.key, () => ({ random: { bytes: size => new Uint8Array(size).fill(61) }, transport: { send: async envelope => { packets[i]!.push(structuredClone(envelope)); return { answer: "routing", reason: "not-found" }; } } }));
    await evictDurableObject(world.binding.get(world.id));
    await runInDurableObject(world.binding.get(world.id) as unknown as DurableObjectStub<TestScope>, instance => instance.alarm!());
  }
  expect(packets[0]).toHaveLength(count); // a root has no creator index target
  expect(packets[1]).toEqual(packets[0]);
  const native = await Promise.all(worlds.map(world => runInDurableObject(world.binding.get(world.id), (_instance, state) => ({
    entries: state.storage.sql.exec("SELECT seq,hash,bytes FROM entry ORDER BY seq").toArray(),
    outbox: state.storage.sql.exec("SELECT * FROM outbox ORDER BY seq,n").toArray(),
  }))));
  expect(native[1]).toEqual(native[0]);
  expect(native[0]!.entries.map(row => JSON.parse(String(row["bytes"])) as { input: { type: string } }).filter(row => row.input.type === "diagnosis")).toHaveLength(count);
  expect(points.length).toBeLessThanOrEqual(250);
  const answers = points.filter(p => p.blobs[0] === "turn" && p.blobs[4] === "answer");
  expect(answers).toHaveLength(1);
  expect(answers[0]!.blobs.slice(3)).toEqual(["dispatch", "answer", "none", "none", "none", "none"]);
  expect(answers[0]!.doubles[0]).toBe(count); expect(answers[0]!.doubles[5]).toBe(count);
  expect(points.filter(p => p.blobs[0] === "metric-dropped")).toHaveLength(1);
  expect(points.at(-1)!.doubles).toEqual([1, 0, 0, 0, 0, 0]);
});

// Invariant: the missing-definition exit before #close still emits a native
// unavailable end. The definition absence is an explicit port fault; the
// turn and SQLite store are real and no native history changes.
test("a missing-definition turn emits its early native end without an entry", async () => {
  const { found } = await import("./support.ts");
  const lane = await found(), points: MetricPoint[] = [];
  const result = await lane.inside(async state => {
    const store = new SqliteStore({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: closure => state.storage.transactionSync(closure) });
    const wakes = new Wakes(store, { set: () => {} }, false);
    const turns = new Turns(store, { clock: lane.c.clock, rules: production().rules, alarm: wakes.deadline, capabilities: null }, lane.c.bounds, () => null, () => undefined);
    const context = operationContext({ DEPLOYMENT: "missing-definition-test", METRICS: { writeDataPoint: p => points.push(structuredClone(p)) } }, lane.name, "alarm", { request: null, trace: null });
    const before = state.storage.sql.exec("SELECT seq,hash,bytes FROM entry ORDER BY seq").toArray();
    return { end: await measured(context, () => turns.run(null)), entered: context.turn.entered, before, after: state.storage.sql.exec("SELECT seq,hash,bytes FROM entry ORDER BY seq").toArray() };
  });
  expect(result.end).toEqual({ end: "unavailable" }); expect(result.entered).toBe(true); expect(result.after).toEqual(result.before);
  expect(points.find(p => p.blobs[0] === "turn")?.blobs.slice(3)).toEqual(["alarm", "unavailable", "none", "none", "none", "none"]);
});
