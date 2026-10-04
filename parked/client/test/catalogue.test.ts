/**
 * The catalogue reads (docs/protocol.md R-DECL-23, section 33.10): `acts()`
 * is always read from the room, `actsAt()` keeps an ended version, and what
 * the handle kept never takes a reader back behind an activation it has seen.
 * An ended version is not final: a later activation can retire its kinds, so
 * every way the handle learns of a later activation drops what it kept, and
 * an answer that such news overtook is not kept (review 43e8fe3b).
 *
 * The fake room runs in its declared mode. The real Room is driven with this
 * client in packages/room/test/workerd.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ActDeclaration, ActsCatalogue, Binding, Room, RoomApi, RoomWire } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS } from "@generalbusiness/artroom-policy/declared";
import { connect, fieldsOf, governs, isRefusal, meaningOf, targetsOf } from "../src/index.ts";
import type { FakeRoom } from "./support/fake-room.ts";
import { joinAs, startRoom, until } from "./support/setup.ts";

let room: FakeRoom;
beforeEach(async () => {
  ({ room } = await startRoom());
});
afterEach(() => room.stop());

const ASK: ActDeclaration = { label: "Ask", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 200 } }, who: { roles: ["member", "agent"] } };
const withAsk = (ask: ActDeclaration = ASK) => ({ ...CODE_REVIEW_ACTS, ask });
const B = (c: string) => `sha256:${c.repeat(64)}` as Binding;
const gets = (route: string) => room.requests.filter((r) => r.method === "GET" && r.route === route).length;
const service = () => ({ room: async (): Promise<RoomWire> => room.wire() });

describe("the catalogue reads", () => {
  test("acts() is always read from the room; actsAt() keeps an ended version and answers its whole interval without a read", async () => {
    const alice = await joinAs(room, "@alice");
    expect(await alice.api.acts()).toMatchObject({ vocabulary: "artroom-legacy-v1", since: 0, until: null });
    await room.activate(withAsk());
    const first = (await alice.api.acts()) as ActsCatalogue;
    expect(first.acts["ask"]).toEqual({ declaration: ASK, binding: await room.bindingOf("ask") });
    await alice.api.claim({ goal: "g", scope: ["src/**"] });
    await room.activate({ ...CODE_REVIEW_ACTS });
    const reads = gets("/declarations");
    expect(await alice.api.acts()).not.toEqual(first);
    expect(await alice.api.acts()).toMatchObject({ until: null });
    expect(gets("/declarations")).toBe(reads + 2);
    // The ended version, by seq: read once, then kept for every seq it governs and for its policy version.
    const ended = (await alice.api.actsAt({ seq: first.since }))!;
    expect(ended).toMatchObject({ policy: first.policy, since: first.since, until: expect.any(Number) });
    expect((ended as ActsCatalogue).acts["ask"]).toMatchObject({ retired: ended.until });
    expect(await alice.api.actsAt({ seq: first.since + 1 })).toBe(ended);
    expect(await alice.api.actsAt({ policy: first.policy })).toBe(ended);
    expect(gets("/declarations")).toBe(reads + 3);
    // A seq it does not govern is read; the active version is never kept; an unknown version is null.
    expect(governs(ended, ended.until!)).toBe(false);
    expect(governs(ended, ended.since)).toBe(true);
    expect(governs(ended, ended.since - 1)).toBe(false);
    expect(await alice.api.actsAt({ seq: ended.until! })).toMatchObject({ until: null });
    expect(await alice.api.actsAt({ seq: ended.until! })).toMatchObject({ until: null });
    expect(gets("/declarations")).toBe(reads + 5);
    expect(await alice.api.actsAt({ policy: "act_999_00000000" })).toBeNull();
    // Over RPC the same reads.
    const rpc = await connect(service(), room.id, { kind: "key", signer: alice.signer });
    expect(await rpc.actsAt({ policy: first.policy })).toEqual(ended);
  });

  test("meaningOf reads a kind under one catalogue: declared with its label and retirement, platform, legacy with its end, unknown", async () => {
    await room.activate(withAsk());
    await room.activate({ ...CODE_REVIEW_ACTS });
    const alice = await joinAs(room, "@alice");
    const legacy = (await alice.api.actsAt({ seq: 0 }))!;
    const declared = (await alice.api.actsAt({ seq: legacy.until! }))! as ActsCatalogue;
    expect(meaningOf(declared, "ask")).toEqual({ vocabulary: "declared", policy: declared.policy, kind: "ask", label: "Ask", declaration: ASK, binding: declared.acts["ask"]!.binding, retired: declared.until });
    expect(meaningOf(declared, "claim")).not.toHaveProperty("retired");
    expect(meaningOf(declared, "renew")).toEqual({ vocabulary: "platform", policy: declared.policy, kind: "renew", label: "Renew" });
    expect(meaningOf(declared, "shout")).toEqual({ vocabulary: "unknown", policy: declared.policy, kind: "shout", label: "shout" });
    // An inherited property name is not a declared kind.
    expect(meaningOf(declared, "toString").vocabulary).toBe("unknown");
    expect(meaningOf(legacy, "claim")).toEqual({ vocabulary: "artroom-legacy-v1", policy: legacy.policy, kind: "claim", label: "Claim", retired: legacy.until });
    expect(meaningOf(legacy, "ask")).toMatchObject({ vocabulary: "unknown" });
    expect(meaningOf((await alice.api.acts()) as ActsCatalogue, "claim")).toMatchObject({ vocabulary: "declared", label: "Claim" });
  });

  test("fieldsOf and targetsOf give a form its fields: the steps' own, then the declared ones, required by target", () => {
    const claim = CODE_REVIEW_ACTS["claim"]!;
    expect(targetsOf(claim)).toEqual(["none", "thread"]);
    expect(fieldsOf(claim, "none")!.map((f) => [f.name, f.from, f.required])).toEqual([
      ["scope", "step", true],
      ["goal", "declaration", true],
      ["plan", "declaration", false],
    ]);
    expect(fieldsOf(claim, "thread")!.map((f) => [f.name, f.from, f.required])).toEqual([
      ["scope", "step", true],
      ["expectedGeneration", "step", true],
      ["lease", "step", false],
      ["goal", "declaration", false],
      ["plan", "declaration", false],
    ]);
    expect(fieldsOf(claim, "version")).toBeNull();
    // A hold whose scope is a template fixes the scope: open takes no scope field.
    const part: ActDeclaration = { label: "Take a part", targets: { none: ["open"] }, body: { part: { type: "enum", values: ["bass", "keys"] } }, who: { roles: ["member"] }, hold: { scope: ["parts/{part}/**"] } };
    expect(fieldsOf(part, "none")!.map((f) => f.name)).toEqual(["part"]);
    // Two steps in one act: each step's fields once.
    const add: ActDeclaration = { label: "Add", targets: { thread: ["version", "land"] }, threads: ["take-part"], who: { roles: ["member"] } };
    expect(fieldsOf(add, "thread")!.map((f) => f.name)).toEqual(["lease", "expectedGeneration", "head"]);
  });
});

describe("an ended version is not final: a later activation can retire its kinds (R-DECL-23)", () => {
  const TELL: ActDeclaration = { label: "Tell", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 200 } }, who: { roles: ["member", "agent"] } };
  const OLD = { ...withAsk(), tell: TELL };

  /**
   * A handle that read version A after it ended, while `tell` was still
   * declared, and kept it. `drop` then activates a version without `tell`,
   * with another `ask` and another `claim`, and returns its seq.
   */
  async function kept(rpc = false) {
    const alice = await joinAs(room, "@alice");
    const api: RoomApi = rpc ? await connect(service(), room.id, { kind: "key", signer: alice.signer }) : alice.api;
    const a = await room.activate(OLD);
    const askA = (await room.bindingOf("ask"))!;
    await room.activate({ ...OLD, more: TELL });
    const first = (await api.actsAt({ policy: a })) as ActsCatalogue;
    expect(first.until).not.toBeNull();
    expect(first.acts["tell"]).not.toHaveProperty("retired");
    const drop = async () => {
      const claim = CODE_REVIEW_ACTS["claim"]!;
      await room.activate({ ...withAsk({ ...ASK, body: { text: { type: "text", max: 100 } } }), claim: { ...claim, body: { ...claim.body, extra: { type: "text", max: 5, optional: true } } } });
      return room.entries.at(-1)!.seq;
    };
    const tellNow = async () => ((await api.actsAt({ policy: a })) as ActsCatalogue).acts["tell"];
    return { alice, api, a, askA, first, drop, tellNow };
  }
  type Kept = Awaited<ReturnType<typeof kept>>;
  test("with no sign of a later activation the handle answers what it kept; { fresh: true } reads again and replaces it", async () => {
    const s = await kept();
    // Reading the active catalogue again, with no new activation, keeps what the handle has.
    await s.api.acts();
    const reads = gets("/declarations");
    expect(await s.api.actsAt({ policy: s.a })).toBe(s.first);
    const dropped = await s.drop();
    // The handle has seen nothing since: it answers the marks it read, and reads nothing.
    expect(await s.api.actsAt({ policy: s.a })).toBe(s.first);
    expect(gets("/declarations")).toBe(reads);
    const fresh = (await s.api.actsAt({ policy: s.a }, { fresh: true })) as ActsCatalogue;
    expect(fresh.acts["tell"]).toMatchObject({ retired: dropped });
    expect(fresh.acts["ask"]).not.toHaveProperty("retired");
    expect(gets("/declarations")).toBe(reads + 1);
    // The fresh answer is the one kept from now on, by policy version and by seq.
    expect(await s.api.actsAt({ policy: s.a })).toBe(fresh);
    expect(await s.api.actsAt({ seq: s.first.since })).toBe(fresh);
    expect(gets("/declarations")).toBe(reads + 1);
  });

  const SIGNS: readonly [string, boolean, (s: Kept) => Promise<void>][] = [
    ["a read of the active catalogue", false, async (s) => void (await s.drop(), await s.api.acts())],
    ["a log page that holds the activation", false, async (s) => void (await s.drop(), await s.api.log())],
    [
      "a read of another version that the activation ended",
      false,
      async (s) => {
        const dropped = await s.drop();
        expect(await s.api.actsAt({ seq: dropped - 1 })).toMatchObject({ until: dropped });
      },
    ],
    [
      "a long-poll update that holds the activation",
      false,
      async (s) => {
        const start = (await s.alice.api.subscribe(undefined, { waitMs: 0 })).cursor;
        await s.drop();
        expect((await s.alice.api.subscribe(start, { waitMs: 1000 })).entries.map((e) => e.kind)).toContain("policy-activated");
      },
    ],
    [
      "a watched update that holds the activation",
      false,
      async (s) => {
        const start = (await s.alice.api.subscribe(undefined, { waitMs: 0 })).cursor;
        const kinds: string[] = [];
        const sub = s.alice.api.watch(start, (u) => kinds.push(...u.entries.map((e) => e.kind)));
        await until(() => room.socketCount === 1);
        await s.drop();
        await until(() => kinds.includes("policy-activated"));
        sub.close();
        expect(kinds).toContain("policy-activated");
      },
    ],
    [
      "an update on the RPC stream that holds the activation",
      true,
      async (s) => {
        const stream = await (s.api as unknown as Room).subscribe();
        const reader = stream.getReader();
        const pending = reader.read();
        await s.drop();
        expect((await pending).done).toBe(false);
        reader.releaseLock();
        await stream.cancel();
      },
    ],
    [
      "a binding-stale refusal of a generic act, which names the active version",
      false,
      async (s) => {
        await s.drop();
        const out = await s.api.act("ask", { act: s.a }, { text: "x" }, { binding: s.askA });
        expect(isRefusal(out) && out.rule).toBe("binding-stale");
      },
    ],
    [
      "a binding-stale refusal of a named act",
      false,
      async (s) => {
        // The handle already read the vocabulary for an earlier named act, so it reads nothing before it signs this one.
        expect(isRefusal(await s.api.claim({ goal: "g", scope: ["docs/**"] }))).toBe(false);
        await s.drop();
        const reads = gets("/declarations");
        const out = await s.api.claim({ goal: "g", scope: ["src/**"] });
        expect(isRefusal(out) && out.rule).toBe("binding-stale");
        expect(gets("/declarations")).toBe(reads);
      },
    ],
  ];

  test.each(SIGNS)("after %s, the handle drops what it kept and the next answer has the room's marks", async (_name, rpc, sign) => {
    const s = await kept(rpc);
    expect(await s.tellNow()).not.toHaveProperty("retired");
    await sign(s);
    const dropped = room.entries.findLast((e) => e.entry.type === "system" && e.entry.event.type === "policy-activated")!.seq;
    expect(await s.tellNow()).toMatchObject({ retired: dropped });
    // The answer it read now is kept in turn.
    expect(await s.api.actsAt({ policy: s.a })).toBe(await s.api.actsAt({ seq: s.first.since }));
  });

  test("a refusal or an update that names no later activation drops nothing", async () => {
    const s = await kept();
    const bob = await joinAs(room, "@bob");
    const start = (await s.alice.api.subscribe(undefined, { waitMs: 0 })).cursor;
    const refused = await s.api.act("ask", { act: s.a }, { text: "x" }, { binding: B("0") });
    expect(isRefusal(refused) && refused.rule).toBe("binding-stale");
    await bob.api.claim({ goal: "g", scope: ["docs/**"] });
    expect((await s.alice.api.subscribe(start, { waitMs: 1000 })).entries.length).toBeGreaterThan(0);
    await s.api.log();
    expect(await s.api.actsAt({ policy: s.a })).toBe(s.first);
  });
});

describe("an answer about an ended version is kept only if no later activation was learnt of meanwhile (R-DECL-23)", () => {
  const TELL: ActDeclaration = { label: "Tell", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 200 } }, who: { roles: ["member", "agent"] } };
  const OLD = { ...withAsk(), tell: TELL };

  /** Version A, ended by a second version that still declares `tell`. `retire` activates a third without it. */
  async function ended() {
    const a = await room.activate(OLD);
    await room.activate({ ...OLD, more: TELL });
    const retire = async () => {
      await room.activate(withAsk());
      return room.entries.at(-1)!.seq;
    };
    return { a, retire };
  }

  /** A handle over HTTPS whose first read of version A is held after the room answered it, until `release`. */
  async function held(a: string) {
    let arrived = () => {};
    let release = () => {};
    const seen = new Promise<void>((resolve) => (arrived = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    let holding = false;
    const hold = async () => {
      if (holding) return;
      holding = true;
      arrived();
      await gate;
    };
    const delayed: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (new URL(input instanceof Request ? input.url : String(input)).searchParams.get("policy") === a) await hold();
      return response;
    };
    const api = (await joinAs(room, "@alice", "member", { fetch: delayed })).api;
    return { api, seen, release };
  }

  test("an answer read before a retirement, arriving after the handle saw that activation, is not kept; the next read asks the room and gets the retired mark", async () => {
    const { a, retire } = await ended();
    const { api, seen, release } = await held(a);
    const oldRead = api.actsAt({ policy: a });
    await seen;
    const dropped = await retire();
    const current = await api.acts();
    expect(current.since).toBe(dropped);
    release();
    const old = (await oldRead) as ActsCatalogue;
    // The held answer is what the room said before the retirement, and its caller gets it as it is.
    expect(old.acts["tell"]).not.toHaveProperty("retired");
    const next = (await api.actsAt({ policy: a })) as ActsCatalogue;
    expect(next.acts["tell"]!.retired).toBe(dropped);
    expect(next).not.toBe(old);
    // That answer is kept: the same question is now answered without a read, as in the sequential case.
    const reads = gets("/declarations");
    expect(await api.actsAt({ policy: a })).toBe(next);
    expect(gets("/declarations")).toBe(reads);
    expect(((await api.actsAt({ policy: a }, { fresh: true })) as ActsCatalogue).acts["tell"]!.retired).toBe(dropped);
  });


  test("a held answer that no activation overtook is kept as before: the next question about its interval is answered without a read", async () => {
    const { a } = await ended();
    const { api, seen, release } = await held(a);
    // The handle already knows the latest activation when it asks.
    await api.acts();
    const oldRead = api.actsAt({ policy: a });
    await seen;
    // Reading the active catalogue again while the answer is held tells the handle nothing new.
    await api.acts();
    release();
    const first = (await oldRead) as ActsCatalogue;
    const reads = gets("/declarations");
    expect(await api.actsAt({ policy: a })).toBe(first);
    expect(await api.actsAt({ seq: first.since })).toBe(first);
    expect(gets("/declarations")).toBe(reads);
  });

  test("a handle that learns of any activation while an answer is held does not keep that answer, since it cannot tell which came first", async () => {
    const { a } = await ended();
    const { api, seen, release } = await held(a);
    // This handle has seen no activation yet. It learns the latest one while the answer is held; none happened meanwhile.
    const oldRead = api.actsAt({ policy: a });
    await seen;
    await api.acts();
    release();
    const first = (await oldRead) as ActsCatalogue;
    const reads = gets("/declarations");
    const next = await api.actsAt({ policy: a });
    expect(next).toEqual(first);
    expect(next).not.toBe(first);
    expect(gets("/declarations")).toBe(reads + 1);
  });
});
