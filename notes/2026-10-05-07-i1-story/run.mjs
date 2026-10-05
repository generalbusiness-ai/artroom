// The I1 story: one observed run of the scope substrate, in one Node process.
//
//   node notes/2026-10-05-07-i1-story/run.mjs
//
// It drives the real code of the six packages: the Worker's routes and the scope's
// object class (packages/scope), the client's HTTP transport and handle
// (packages/client), and the replay command (packages/replay). No network, no
// deployment. Three things here stand in for the Cloudflare runtime:
//
//   - `cloudflare:workers`: two empty base classes, `DurableObject` and `WorkerEntrypoint`;
//   - a Durable Object's state: SQLite storage over `node:sqlite` in memory, one
//     database for each object, a stored alarm time that nothing fires, and `waitUntil`;
//   - the namespace binding: one object for each name, each call a copy of its
//     arguments and of its answer, as a call between two objects is.
//
// The clock, the random source, the authority and the readers are fixed test ports:
// one clock that this script moves, an incarnation derived from the scope's name,
// every grant current, every reader allowed. The definitions, keys and grants are
// derive's test fixtures (`@generalbusiness/artroom-derive/testing`).
//
// The packages are TypeScript. The scope package has one parameter property
// (src/turn.ts), which Node's type stripping does not take, so every `.ts` file
// is transpiled by esbuild, file by file, with no bundling.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

const RUNTIME = "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\nexport class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n";
registerHooks({
  resolve: (specifier, context, next) => (specifier === "cloudflare:workers" ? { url: `data:text/javascript,${encodeURIComponent(RUNTIME)}`, shortCircuit: true } : next(specifier, context)),
  load: (url, context, next) => (url.startsWith("file:") && url.endsWith(".ts")
    ? { format: "module", shortCircuit: true, source: transformSync(readFileSync(fileURLToPath(url), "utf8"), { loader: "ts", format: "esm", target: "esnext" }).code }
    : next(url, context)),
});

const { DeployedScope, route } = await import("@generalbusiness/artroom-scope/worker");
const { found, httpTransport, secretSigner, signedIntent } = await import("@generalbusiness/artroom-client");
const { main: replay } = await import("@generalbusiness/artroom-replay");
const { deskDefinition, ticketDefinition, grantOf, keys } = await import("@generalbusiness/artroom-derive/testing");
const { scopeIdOf } = await import("@generalbusiness/artroom-bytes");

// ---------------------------------------------------------------- the stand-ins

const START = Date.parse("2026-10-05T07:00:00Z");
const world = { now: START, hold: null, waiting: [] };
const time = () => new Date(world.now).toISOString().replace(".000Z", "Z");

/** A Durable Object's state: SQLite storage in memory, one alarm time, and `waitUntil`. */
function stateOf(name) {
  const db = new DatabaseSync(":memory:");
  let depth = 0;
  let alarm = null;
  return {
    id: { name },
    waitUntil: (promise) => { world.waiting.push(promise); },
    storage: {
      sql: {
        exec(query, ...bindings) {
          if (bindings.length === 0 && query.includes(";")) return db.exec(query), { toArray: () => [] };
          const rows = db.prepare(query).all(...bindings);
          return { toArray: () => rows.map((row) => ({ ...row })) };
        },
      },
      transactionSync(closure) {
        const point = `story_${depth++}`;
        db.exec(`SAVEPOINT ${point}`);
        try {
          const result = closure();
          db.exec(`RELEASE ${point}`);
          return result;
        } catch (error) {
          db.exec(`ROLLBACK TO ${point}; RELEASE ${point}`);
          throw error;
        } finally {
          depth--;
        }
      },
      setAlarm: (at) => { alarm = at; },
      deleteAlarm: () => { alarm = null; },
      getAlarm: () => alarm,
    },
  };
}

/** The deployed class, with the fixed test ports in place of the clock, the random source, the authority and the readers. */
class StoryScope extends DeployedScope {
  wiring(name) {
    const deployed = super.wiring(name);
    const transport = deployed.ports.transport;
    return {
      ports: {
        ...deployed.ports,
        clock: { read: time },
        random: { bytes: (length) => new Uint8Array(createHash("sha256").update(`i1-story:${name}`).digest().subarray(0, length)) },
        authority: { current: () => true },
        readers: { allows: () => true },
        // `world.hold`: a send it matches is not delivered, and its attempt gets no answer.
        transport: { send: async (envelope) => (world.hold?.(envelope) ? null : transport.send(envelope)) },
      },
    };
  }
}

/** The one scope namespace: an object for each name. A call copies what crosses, as a call between two objects does. */
const objects = new Map();
const env = {
  SCOPES: {
    idFromName: (name) => ({ name }),
    get({ name }) {
      if (!objects.has(name)) objects.set(name, new StoryScope(stateOf(name), env));
      const object = objects.get(name);
      return new Proxy({}, { get: (_, method) => async (...args) => structuredClone(await object[method](...structuredClone(args))) });
    },
  },
};

/** Wait until no dispatcher has anything to do now. It carries nothing: the dispatchers do. */
async function settle() {
  for (let made = 1; made > 0;) {
    made = 0;
    while (world.waiting.length > 0) await world.waiting.shift();
    for (const object of objects.values()) made += await object.dispatch();
  }
}
/** Move the clock on, and let the dispatchers do what is then due. */
async function later(seconds) {
  world.now += seconds * 1000;
  await settle();
}

// ---------------------------------------------------------------- the caller's side

const SERVICE = "https://scopes.story";
const fetch = (url, init = {}) => route(new Request(url, { method: init.method, headers: init.headers, body: init.body }), env.SCOPES);
const transport = httpTransport(SERVICE, { fetch });
const READER = "a story reader";
const { rita, una } = keys;
let key = 0;
const intent = (who, asked) => signedIntent(secretSigner(who.secret), asked, { now: world.now, idempotencyKey: `story-${key++}` });

const out = (line = "") => console.log(line);
const short = (id) => String(id).replace(/^([a-z0-9]+:)?(.{12}).*$/, "$1$2");
const names = new Map();
const who = (scope) => names.get(scope) ?? short(scope);
const fact = (f) => `${who(f.at.scope)}.${f.seq}`;
const ok = (read) => { if (!read.ok) throw new Error(`a read was refused: ${read.reason}`); return read; };

/** A handle on a scope, with the short forms this story needs. */
class Seat {
  constructor(name, handle, declared) { Object.assign(this, { name, handle, declared }); names.set(handle.scope, name); }
  async summary() { return ok(await this.handle.summary()); }
  async at() { return (await this.summary()).value.scope; }
  async entries() { return ok(await this.handle.history()).value; }
  async act(actor, kind, asked = {}) {
    const at = await this.at();
    const grants = [grantOf(actor, at, Object.values(this.declared.acts).map((a) => a.grant))];
    return this.handle.submit(await intent(actor, { to: at, kind, ...asked }), grants);
  }
  async did(actor, kind, asked = {}) {
    const answer = await this.act(actor, kind, asked);
    if (answer.answer !== "accepted") throw new Error(`${kind} was not accepted: ${JSON.stringify(answer)}`);
    return answer.receipt;
  }
  /** The scope that send `n` of entry `seq` creates: its ID is the digest of the send's seed. */
  async created(seq, label, n = 0) {
    const send = (await this.entries())[seq].entry.sends.find((s) => s.n === n);
    return new Seat(label, new this.handle.constructor(transport, scopeIdOf(send.to), READER), ticketDefinition.declared);
  }
  async status() { const read = await this.handle.summary(); return read.ok ? `${read.value.status}, head ${read.at.seq}` : read.reason; }
  async item(id) { return (await this.summary()).value.items.find((i) => i.id === id); }
  async duty(id) {
    const d = ok(await this.handle.followDuty(id)).value;
    const log = d.attempts.map((a) => a.answer).join(", ") || "none";
    const result = d.result ? `result ${d.result.clause} at ${this.name}.${d.result.seq}` : d.class === "request" ? "no result yet" : "no result is due";
    return `${this.name} duty ${id}: ${d.class}${d.held ? ", held" : ""}; attempts: ${log}; ${d.acknowledged ? `acknowledged with ${fact(d.acknowledged)}` : "not acknowledged"}; ${result}`;
  }
}

/** One line for each entry: its input, where it came from, what it changed and what it sends. */
function line({ entry }) {
  const i = entry.input;
  let what = i.type;
  if (i.type === "genesis") what = i.source ? `genesis, created by ${fact(i.source)}, decision ${i.decision}` : "genesis, founded by a signed intent";
  if (i.type === "act") what = `act ${i.signed.intent.kind}`;
  if (i.type === "delivery") {
    const m = i.message;
    const name = m.class === "request" ? `${m.type}${m.type === "relate" ? ` "${m.body.name}" ${m.body.state}` : m.type === "tell" ? ` "${m.body.message}"` : ""}` : m.class === "result" ? `${m.outcome ?? ""} for ${fact(m.of.from)}`.trim() : m.type;
    what = `delivery of ${m.class} ${name} from ${fact(i.from)}${"decision" in i ? `, decision ${i.decision}` : ""}${"clause" in i ? `, clause ${i.clause}` : ""}`;
  }
  const effects = entry.effects.map((e) => (e.effect === "state" ? `item ${e.item} is ${e.state}` : e.effect === "relation" ? `copy "${e.name}" of ${who(e.owner?.scope ?? "")} item ${e.item} is ${e.state} at revision ${e.revision}` : e.effect)).filter((e, n, all) => all.indexOf(e) === n);
  const sends = entry.sends.map((s) => `${s.message.class}${s.message.type ? ` ${s.message.type}` : ""}`);
  return `  ${who(entry.at.scope)}.${entry.seq}  ${what}${effects.length ? `; effects: ${effects.join(", ")}` : ""}${sends.length ? `; sends: ${sends.join(", ")}` : ""}`;
}
async function history(seat, from = 0) { for (const sealed of (await seat.entries()).slice(from)) out(line(sealed)); }

// ---------------------------------------------------------------- the story

out(`I1 story. Clock starts at ${time()}. Node ${process.version}.`);
out();
out("Step 0. Rita founds a desk D (a directory) over the HTTP routes.");
const founding = await intent(rita, { to: null, kind: "found", fields: { source: "a repository" } });
const made = await found(transport, founding, deskDefinition.declared, [ticketDefinition.declared], READER);
if (!made.scope) throw new Error(`the desk was not founded: ${JSON.stringify(made.answer)}`);
const D = new Seat("D", made.scope, deskDefinition.declared);
await settle();
out(`  POST /v1/scopes -> ${made.answer.answer}, receipt for ${fact(made.answer.receipt.fact)}`);

out();
out("Step 1. D creates a ticket P (a lane). The confirmation is held back first.");
world.hold = (envelope) => envelope.message.class === "control";
const opened = await D.did(rita, "open-issue", { fields: { title: "A flaky test" } });
out(`  rita submits open-issue to D -> accepted, receipt for ${fact(opened.fact)}, duties ${opened.sends.join(", ")}`);
const P = await D.created(opened.fact.seq, "P");
await settle();
await history(D, 1);
await history(P);
out(`  P is ${await P.status()}. D item 1 is ${(await D.item(1)).state}.`);
out(`  ${await P.duty("0.0")}`);
out(`  ${await P.duty("0.1")}`);
out(`  una submits approve to P -> ${JSON.stringify(await P.act(una, "approve", { on: 0, expected: { on: 1 } }))}`);
out("  The hold is lifted and the clock moves 1 second. D's dispatcher sends the confirmation again.");
world.hold = null;
await later(1);
await history(P, 1);
await history(D, 3);
out(`  P is ${await P.status()}.`);
out(`  ${await D.duty("1.0")}`);
out(`  ${await D.duty("2.0")}`);
const second = await D.did(rita, "open-issue", { fields: { title: "A slow build" } });
const I = await D.created(second.fact.seq, "I");
await settle();
out(`  D creates a second ticket I the same way, with nothing held. I is ${await I.status()}.`);

out();
out("Step 2a. A relationship update. P links to I, then removes the link.");
const linked = await P.did(rita, "link", { fields: { target: await I.at(), about: 0 } });
out(`  rita submits link to P -> accepted, receipt for ${fact(linked.fact)}, duties ${linked.sends.join(", ")}`);
await settle();
await history(P, 2);
await history(I, 2);
out(`  I item 0 slot "linked" is ${JSON.stringify((await I.item(0)).values.linked)}.`);
out(`  ${await P.duty(linked.sends[0])}`);
const unlinked = await P.did(rita, "unlink", { on: linked.fact.seq, expected: { on: 1 } });
out(`  rita submits unlink to P -> accepted, receipt for ${fact(unlinked.fact)}, duties ${unlinked.sends.join(", ")}`);
await settle();
await history(P, 4);
await history(I, 3);
out(`  I item 0 slot "linked" is ${JSON.stringify((await I.item(0)).values.linked)}.`);

out();
out("Step 2b. A tell. P asks the desk D for another ticket.");
const asked = await P.did(una, "ask", { fields: { desk: await D.at() } });
out(`  una submits ask to P -> accepted, receipt for ${fact(asked.fact)}, duties ${asked.sends.join(", ")}. P item ${asked.fact.seq} is ${(await P.item(asked.fact.seq)).state}.`);
await settle();
const told = (await D.entries()).find((s) => s.entry.input.type === "delivery" && s.entry.input.from.seq === asked.fact.seq && s.entry.input.from.at.scope === P.handle.scope);
const [sent, recorded] = (await P.entries()).slice(6);
for (const sealed of [sent, told, recorded]) out(line(sealed));
out(`  ${await P.duty(asked.sends[0])}`);
const answered = (await ok(await P.handle.items("request")).value).find((i) => i.id === asked.fact.seq);
out(`  P item ${asked.fact.seq} is ${answered?.state}. D now has ${(await D.entries()).length} entries and has created ${objects.size - 1} tickets.`);

out();
out("The scopes, in full:");
for (const seat of [D, P, I]) { const at = await seat.at(); out(`  ${seat.name} = ${at.scope}, incarnation ${at.inc}, ${at.kind}`); }

out();
out("Step 3. Replay of P from its retained history, by the replay command, over the read routes.");
const head = (await P.summary()).at;
const args = [SERVICE, P.handle.scope, "--mode", "replay", "--head", `${head.seq}:${head.hash}`];
out(`  artroom-replay ${args.join(" ")}`);
out();
const code = await replay(args, { out, err: out, fetch: (url, init = {}) => fetch(url, { method: init.method, headers: { ...init.headers, authorization: READER } }) });
out();
out(`  exit code ${code}`);
