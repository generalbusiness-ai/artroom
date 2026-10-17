import { expect, test } from "vitest";
import type { FactRef } from "@generalbusiness/dap-contract";
import { canonicalize, definitionDigest } from "@generalbusiness/artroom-bytes";
import { firstExtents } from "@generalbusiness/dap-platform";
import { pantry } from "./support/pantry.ts";
import { mcpRoom, type Agent, type Room } from "./support/room.ts";
import { created } from "./support/story.ts";

/** Whether `name` is an own property of `v`, with that value: not lost to the prototype setter, and not the prototype. */
const own = (v: unknown, name: string): unknown => (v !== null && typeof v === "object" && Object.hasOwn(v, name) ? Object.getOwnPropertyDescriptor(v, name)!.value : "(not own)");

/** One act, accepted: called again with the same key while the scope has not yet observed the caller's authority. */
async function accepted(room: Room, agent: Agent, tool: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  for (let i = 0; ; i++) {
    const done = await agent.ok(tool, args);
    if (done["answer"] !== "unavailable" || i === 5) { expect(done["answer"], `${tool}: ${JSON.stringify(done)}`).toBe("accepted"); return done; }
    await room.pause();
  }
}

/** A room whose directory has created the pantry as lane 1, with rita, its creator, in the given mode. */
async function pantryRoom(room: Room, mode: "default" | "add"): Promise<Agent> {
  const rita = room.agent("rita", { mode });
  await created(room, rita);
  await rita.ok("rules.publish", { on: 0, fields: { approvals: 0, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 0, checks: [] }) }, idempotencyKey: "publish" });
  expect((await rita.ok("rules.activate", { fields: { digest: definitionDigest(pantry), name: "pantry" }, values: [canonicalize(pantry)], idempotencyKey: "activate" }))["answer"]).toBe("accepted");
  const opened = await rita.ok("issue.create", { fields: { definition: definitionDigest(pantry), title: "The pantry", conditions: ["it keeps"] }, idempotencyKey: "pantry" });
  expect((await rita.ok("wait", { scope: "directory", entry: (opened["fact"] as FactRef).seq }))["timedOut"]).toBe(false);
  return rita;
}

// Invariant: a name a definition lawfully chose is kept as an own property wherever the server holds it, even `__proto__`: a
// required text field, a member of a record field, a presented fact and a bound `also` alias each reach the scope's entry, and
// the native runtime accepts the act. A plain assignment would have dropped each one, and the scope would have refused.
test("__proto__ as a field, a record member, a presented fact and an also alias, accepted natively", async () => {
  const room = mcpRoom();
  try {
    const rita = await pantryRoom(room, "default");
    const root = 1;

    // A required text field and a record member, both named __proto__, as JSON brings them.
    const filled = await accepted(room, rita, "pantry.fill", { target: root, fields: JSON.parse('{ "__proto__": "jam", "label": { "__proto__": "red" } }'), idempotencyKey: "fill" });
    const fill = filled["fact"] as FactRef;
    const fillEntry = (await rita.ok("step", { scope: root, seq: fill.seq }))["entry"] as { input: { signed: { intent: { fields: Record<string, unknown> } } } };
    const fields = fillEntry.input.signed.intent.fields;
    expect([own(fields, "__proto__"), own(own(fields, "label"), "__proto__")]).toEqual(["jam", "red"]);
    const jar = (await rita.ok("inspect", { scope: root }))["items"] as { id: number; type: string; values: Record<string, unknown> }[];
    const filledJar = jar.find((i) => i.type === "jar")!;
    expect([own(filledJar.values, "__proto__"), own(own(filledJar.values, "label"), "__proto__")]).toEqual(["jam", "red"]);
    const shelf = jar.find((i) => i.type === "shelf")!;

    // An also alias named __proto__, bound by the jar field: its expected revision travels under that name.
    const checked = await accepted(room, rita, "pantry.check", { target: root, on: shelf.id, fields: { jar: filledJar.id, title: "Checked" }, idempotencyKey: "check" });
    const checkEntry = (await rita.ok("step", { scope: root, seq: (checked["fact"] as FactRef).seq }))["entry"] as { input: { signed: { intent: { expected: Record<string, unknown> } } } };
    expect(own(checkEntry.input.signed.intent.expected, "__proto__")).toEqual(expect.any(Number));

    // A presented fact named __proto__.
    const sealed = await accepted(room, rita, "pantry.seal", { target: root, on: filledJar.id, presented: JSON.parse(`{ "__proto__": ${JSON.stringify(fill)} }`), idempotencyKey: "seal" });
    const sealEntry = (await rita.ok("step", { scope: root, seq: (sealed["fact"] as FactRef).seq }))["entry"] as { input: Record<string, unknown> };
    expect(own(sealEntry.input["presented"], "__proto__")).toEqual(fill);
  } finally { room.done(); }
}, 120_000);

// Invariant: an optional name the caller left out stays out, even when an object's prototype has that name: omitted optional
// fields named __proto__, constructor and toString, an empty nested record, and an optional presented fact named constructor
// with presented absent or empty, each sent through the generic act tool, are accepted natively, with no such own name in the
// intent. Given, the same names arrive as own properties with their values.
test("optional prototype names left out stay out, through act", async () => {
  const room = mcpRoom();
  try {
    const rita = await pantryRoom(room, "add");
    const root = 1;
    const viaAct = async (kind: string, args: Record<string, unknown>) => {
      const acts = await rita.ok("actions", { scope: root });
      return accepted(room, rita, "act", { target: root, kind, digest: acts["digest"], ...args });
    };
    const intentOf = async (done: Record<string, unknown>) => ((await rita.ok("step", { scope: root, seq: (done["fact"] as FactRef).seq }))["entry"] as { input: { presented?: Record<string, unknown>; signed: { intent: { fields: Record<string, unknown> } } } }).input;

    // Every optional name left out, and the required record given empty.
    const bare = await intentOf(await viaAct("stock", { fields: JSON.parse('{ "box": {} }'), idempotencyKey: "stock-bare" }));
    expect([Object.keys(bare.signed.intent.fields), Object.keys(own(bare.signed.intent.fields, "box") as object)]).toEqual([["box"], []]);
    // The same names given: each an own property, with its value.
    const full = await intentOf(await viaAct("stock", { fields: JSON.parse('{ "__proto__": "a", "constructor": "b", "toString": { "__proto__": "c" }, "box": { "valueOf": "d" } }'), idempotencyKey: "stock-full" }));
    const f = full.signed.intent.fields;
    expect([own(f, "__proto__"), own(f, "constructor"), own(own(f, "toString"), "__proto__"), own(own(f, "box"), "valueOf"), own(own(f, "box"), "__proto__")]).toEqual(["a", "b", "c", "d", "(not own)"]);

    // An optional presented fact named constructor, with presented left out, and with presented empty.
    const jars = ((await rita.ok("inspect", { scope: root }))["items"] as { id: number; type: string; state: string }[]).filter((i) => i.type === "jar");
    expect(jars).toHaveLength(2);
    for (const [jar, presented] of [[jars[0]!, undefined], [jars[1]!, {}]] as const) {
      const closed = await intentOf(await viaAct("close", { on: jar.id, ...(presented ? { presented } : {}), idempotencyKey: `close-${jar.id}` }));
      expect(own(closed.presented ?? {}, "constructor"), JSON.stringify(presented)).toBe("(not own)");
    }
    // Both jars are sealed, a final state: neither is live any more.
    expect(((await rita.ok("inspect", { scope: root }))["items"] as { type: string }[]).filter((i) => i.type === "jar")).toEqual([]);
  } finally { room.done(); }
}, 120_000);

// Invariant: an act's subjects are resolved from the fields the scope will read, defaults applied, while the intent signs the
// fields as given. Through act: a selector left out whose default selects the also item is accepted, with the field absent from
// the intent and the alias's expected revision present; an envelope kept with that revision is refused revision-moved once the
// selected item moves; an explicit selector overrides the default; and a selector left out with no default signs no alias.
test("a defaulted selector: the alias's revision follows the default, the field stays unsigned", async () => {
  const room = mcpRoom();
  try {
    const rita = await pantryRoom(room, "add");
    const root = 1;
    const viaAct = async (kind: string, args: Record<string, unknown>) => {
      const acts = await rita.ok("actions", { scope: root });
      return accepted(room, rita, "act", { target: root, kind, digest: acts["digest"], ...args });
    };
    const intentOf = async (done: Record<string, unknown>) => ((await rita.ok("step", { scope: root, seq: (done["fact"] as FactRef).seq }))["entry"] as { input: { signed: { intent: { fields: Record<string, unknown>; expected: Record<string, unknown> } } } }).input.signed.intent;
    const live = async () => (await rita.ok("inspect", { scope: root }))["items"] as { id: number; type: string; revision: number }[];

    await viaAct("fill", { fields: JSON.parse('{ "__proto__": "jam", "label": { "__proto__": "red" } }'), idempotencyKey: "fill-1" });
    await viaAct("fill", { fields: JSON.parse('{ "__proto__": "honey", "label": { "__proto__": "gold" } }'), idempotencyKey: "fill-2" });
    const before = await live();
    const shelf = before.find((i) => i.type === "shelf")!;
    const [first, second] = before.filter((i) => i.type === "jar");
    expect(first!.id, "the definition's default selects the first jar").toBe(2);

    // The selector left out: the default selects jar 2; the intent carries no jar, and expects jar 2's revision.
    const omitted = await intentOf(await viaAct("recheck", { on: shelf.id, fields: { title: "Defaulted" }, idempotencyKey: "recheck-default" }));
    expect([Object.hasOwn(omitted.fields, "jar"), own(omitted.expected, "__proto__"), Object.keys(omitted.expected).sort()]).toEqual([false, first!.revision, ["__proto__", "on"]]);

    // An explicit selector overrides the default: jar `second` is expected.
    const shelfNow = (await live()).find((i) => i.type === "shelf")!;
    const overridden = await intentOf(await viaAct("recheck", { on: shelfNow.id, fields: { jar: second!.id, title: "Overridden" }, idempotencyKey: "recheck-override" }));
    expect([own(overridden.fields, "jar"), own(overridden.expected, "__proto__")]).toEqual([second!.id, second!.revision]);

    // An envelope kept with the default's revision, then the selected jar moves: the kept envelope is refused revision-moved.
    const acts = await rita.ok("actions", { scope: root });
    const kept = await rita.ok("prepare", { resource: root, capability: "hold@1", step: "stage", target: root, kind: "recheck", digest: acts["digest"], on: (await live()).find((i) => i.type === "shelf")!.id, fields: { title: "Kept" }, idempotencyKey: "recheck-moved" });
    // prepare keeps the envelope only: pantry declares no capability, so the step is refused and no hold stage is accepted.
    expect([(kept["act"] as { phase: string }).phase, (kept["step"] as { answer: { answer: string; reason: string } }).answer]).toMatchObject(["prepared", { answer: "refused", reason: "bad-field" }]);
    const r0 = (await live()).find((i) => i.id === first!.id)!.revision;
    await viaAct("shake", { on: first!.id, fields: { note: "shaken" }, idempotencyKey: "shake" });
    expect((await live()).find((i) => i.id === first!.id)!.revision, "the jar's revision moved").toBe(r0 + 1);
    const moved = await rita.ok("act", { target: root, kind: "recheck", digest: acts["digest"], on: (await live()).find((i) => i.type === "shelf")!.id, fields: { title: "Kept" }, idempotencyKey: "recheck-moved" });
    expect([moved["answer"], moved["reason"]], JSON.stringify(moved)).toEqual(["refused", "revision-moved"]);

    // A selector left out with no default: no alias is bound, and none is expected.
    const glanced = await rita.ok("act", { target: root, kind: "glance", digest: acts["digest"], on: (await live()).find((i) => i.type === "shelf")!.id, fields: { title: "Glanced" }, idempotencyKey: "glance" });
    expect(glanced["answer"], JSON.stringify(glanced)).toBe("accepted");
    const glance = await intentOf(glanced);
    expect([Object.hasOwn(glance.fields, "jar"), Object.keys(glance.expected)]).toEqual([false, ["on"]]);
  } finally { room.done(); }
}, 120_000);

// Invariant: an also item selected by a declared fact field is expected like one selected by an item ID: the scope reads a local
// fact as its seq, and so does the server when it resolves the act's subjects, while the intent signs the fact as given. Through
// act: the fill that opened a jar selects it, the act is accepted with the original fact in the signed fields and the alias's
// revision in expected; an envelope kept with that revision is refused revision-moved once the jar moves.
test("a local fact selects the also item: the fact signed as given, the alias's revision expected", async () => {
  const room = mcpRoom();
  try {
    const rita = await pantryRoom(room, "add");
    const root = 1;
    const viaAct = async (kind: string, args: Record<string, unknown>) => {
      const acts = await rita.ok("actions", { scope: root });
      return accepted(room, rita, "act", { target: root, kind, digest: acts["digest"], ...args });
    };
    const intentOf = async (done: Record<string, unknown>) => ((await rita.ok("step", { scope: root, seq: (done["fact"] as FactRef).seq }))["entry"] as { input: { signed: { intent: { fields: Record<string, unknown>; expected: Record<string, unknown> } } } }).input.signed.intent;
    const live = async () => (await rita.ok("inspect", { scope: root }))["items"] as { id: number; type: string; revision: number }[];

    const fill = (await viaAct("fill", { fields: JSON.parse('{ "__proto__": "jam", "label": { "__proto__": "red" } }'), idempotencyKey: "fill" }))["fact"] as FactRef;
    const jar = (await live()).find((i) => i.type === "jar")!;
    expect(jar.id, "the fill's seq is the jar it opened").toBe(fill.seq);
    const shelf = () => live().then((items) => items.find((i) => i.type === "shelf")!.id);

    const verified = await intentOf(await viaAct("verify", { on: await shelf(), fields: { jarFact: fill, title: "Verified" }, idempotencyKey: "verify" }));
    expect([own(verified.fields, "jarFact"), Object.keys(verified.expected).sort(), own(verified.expected, "selected")]).toEqual([fill, ["on", "selected"], jar.revision]);

    // A kept envelope, then the selected jar moves: refused revision-moved.
    const acts = await rita.ok("actions", { scope: root });
    const args = { target: root, kind: "verify", digest: acts["digest"], on: await shelf(), fields: { jarFact: fill, title: "Kept" }, idempotencyKey: "verify-moved" };
    const kept = await rita.ok("prepare", { resource: root, capability: "hold@1", step: "stage", ...args });
    // prepare keeps the envelope only: pantry declares no capability, so the step is refused and no hold stage is accepted.
    expect([(kept["act"] as { phase: string }).phase, (kept["step"] as { answer: { answer: string; reason: string } }).answer]).toMatchObject(["prepared", { answer: "refused", reason: "bad-field" }]);
    const before = (await live()).find((i) => i.id === jar.id)!.revision;
    await viaAct("shake", { on: jar.id, fields: { note: "shaken" }, idempotencyKey: "shake" });
    expect((await live()).find((i) => i.id === jar.id)!.revision, "the jar's revision moved").toBe(before + 1);
    const moved = await rita.ok("act", args);
    expect([moved["answer"], moved["reason"]], JSON.stringify(moved)).toEqual(["refused", "revision-moved"]);
  } finally { room.done(); }
}, 120_000);
