import { expect, test } from "vitest";
import type { FactRef } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest } from "@generalbusiness/artroom-bytes";
import { firstExtents } from "@generalbusiness/artroom-platform";
import { pantry } from "./support/pantry.ts";
import { mcpRoom, type Agent, type Room } from "./support/room.ts";
import { founded } from "./support/story.ts";

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

/** A room whose directory has created the pantry as lane 1, with rita, its founder, in the given mode. */
async function pantryRoom(room: Room, mode: "default" | "add"): Promise<Agent> {
  const rita = room.agent("rita", { mode });
  await founded(room, rita);
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
