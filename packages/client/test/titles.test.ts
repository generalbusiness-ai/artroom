/**
 * What readers call a record, and a thread that has no goal (docs/protocol.md
 * section 33.10, R-DECL-23; the planner's decision c37653e1): the act's
 * label at its own seq, then its first text field by name, as that act's
 * own declaration typed its fields at that seq. The helpers are the ones
 * every reader shares: the client, the CLI, the MCP tool `act` and the UI.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { envelopeOf, type ActDeclaration, type ActsCatalogue, type DeclaredRecord, type RecordMeaning } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS } from "@generalbusiness/artroom-policy/declared";
import { meaningOf, threadTitle, titleOf } from "../src/index.ts";
import { FakeRoom } from "./support/fake-room.ts";
import { joinAs, startRoom } from "./support/setup.ts";

const KEYS = ["c", "d", "blue", "bossa"] as const;
/** An opening act whose first field by name, `key`, is an enum, and whose `title` is text. */
const SONG: ActDeclaration = {
  label: "Start a song",
  targets: { none: ["open"] },
  body: { key: { type: "enum", values: KEYS, optional: true }, title: { type: "text", max: 80, optional: true }, tempo: { type: "int", min: 40, max: 240, optional: true } },
  who: { roles: ["member", "agent"] },
  hold: { scope: "body.scope", workspace: true },
};
/** The same names with the two types exchanged: `key` is text and `title` an enum. */
const SWAPPED: ActDeclaration = { ...SONG, body: { ...SONG.body, key: { type: "text", max: 80, optional: true }, title: { type: "enum", values: KEYS, optional: true } } };
const declared = (declaration: ActDeclaration, label = declaration.label) => ({ label, declaration });

describe("titleOf prefers the first text field by name (section 33.10)", () => {
  test("the declared type decides, not the type of the value or the order of names: one body under two declarations", () => {
    expect(titleOf(declared(SONG), { key: "c", title: "Footprints", tempo: 96 })).toBe("Start a song: Footprints");
    const body = { key: "blue", title: "bossa" };
    // Both values are strings. Under SONG `title` is the text field; under SWAPPED `key` is.
    expect(titleOf(declared(SONG), body)).toBe("Start a song: bossa");
    expect(titleOf(declared(SWAPPED), body)).toBe("Start a song: blue");
    // The control: with the declaration not at hand, the same body is named by its first field by name.
    expect(titleOf({ label: "Start a song" }, { key: "c", title: "Footprints", tempo: 96 })).toBe("Start a song: c");
  });

  test("the order a body was typed in does not matter: the typed body and the canonical record give one title", () => {
    const typed = { title: "So What", tempo: 136, key: "d", scope: ["songs/so-what/**"] };
    const canonical = { key: "d", scope: ["songs/so-what/**"], tempo: 136, title: "So What" };
    expect(Object.keys(typed)).not.toEqual(Object.keys(canonical));
    expect(titleOf(declared(SONG), typed)).toBe("Start a song: So What");
    expect(titleOf(declared(SONG), canonical)).toBe("Start a song: So What");
    // Among several text fields the first by name is taken, in either order.
    const two: ActDeclaration = { ...SONG, body: { ...SONG.body, composer: { type: "text", max: 80, optional: true } } };
    expect(titleOf(declared(two), { title: "Footprints", composer: "Shorter", key: "c" })).toBe("Start a song: Shorter");
    expect(titleOf(declared(two), { composer: "Shorter", key: "c", title: "Footprints" })).toBe("Start a song: Shorter");
  });

  test("an absent text field is passed over: the next text field, else the first field by name, else the label alone; scope and because never name a record", () => {
    const two: ActDeclaration = { ...SONG, body: { ...SONG.body, composer: { type: "text", max: 80, optional: true } } };
    expect(titleOf(declared(two), { key: "c", title: "Footprints" })).toBe("Start a song: Footprints");
    expect(titleOf(declared(two), { key: "c", tempo: 96 })).toBe("Start a song: c");
    expect(titleOf(declared(two), { tempo: 96 })).toBe("Start a song: 96");
    expect(titleOf(declared(two), { scope: ["songs/**"], because: [] })).toBe("Start a song");
    expect(titleOf(declared(SONG), { scope: ["songs/**"], because: [{ act: "act_1_00000000" }], title: "Blue Bossa" })).toBe("Start a song: Blue Bossa");
    // An act that declares no field at all.
    const none: ActDeclaration = { label: "Start a jam", targets: { none: ["open"] }, who: { roles: ["member"] }, hold: { scope: "body.scope", workspace: true } };
    expect(titleOf(declared(none), { scope: ["jams/**"] })).toBe("Start a jam");
  });

  test("a field named like an inherited property is text only if the declaration says so, by its own name", () => {
    const odd: ActDeclaration = { ...SONG, body: { key: { type: "enum", values: KEYS, optional: true }, valueOf: { type: "text" as const, max: 80, optional: true as const } } as NonNullable<ActDeclaration["body"]> };
    expect(titleOf(declared(odd), { key: "c", valueOf: "Nardis" })).toBe("Start a song: Nardis");
    expect(titleOf(declared(SONG), { key: "c", valueOf: "Nardis" })).toBe("Start a song: c");
  });

  test("legacy, platform and unknown kinds, and a caller with only a label, keep the first field by name", () => {
    const legacy: RecordMeaning = { vocabulary: "artroom-legacy-v1", policy: "act_1_aaaaaaaa", kind: "claim", label: "Claim" };
    const platform: RecordMeaning = { vocabulary: "platform", policy: "act_1_aaaaaaaa", kind: "recover", label: "Recover" };
    const unknown: RecordMeaning = { vocabulary: "unknown", policy: "act_1_aaaaaaaa", kind: "shout", label: "shout" };
    expect(titleOf(legacy, { plan: "p", goal: "Rate-limit login", scope: ["src/**"] })).toBe("Claim: Rate-limit login");
    expect(titleOf(platform, { op: "open", goal: "Repair the policy", scope: [".artroom/**"] })).toBe("Recover: Repair the policy");
    expect(titleOf(unknown, { text: "x", count: 3 })).toBe("shout: 3");
    expect(titleOf({ label: "Start a song" }, { title: "Blue Bossa", key: "c" })).toBe("Start a song: c");
  });

  test("a value is shown as it is: text, yes or no, a number, a list of text, anything else as JSON; a body that is not an object gives the label alone", () => {
    const ask = { label: "Ask" };
    expect(titleOf(ask, { swing: true })).toBe("Ask: yes");
    expect(titleOf(ask, { swing: false })).toBe("Ask: no");
    expect(titleOf(ask, { tempo: 132 })).toBe("Ask: 132");
    expect(titleOf(ask, { parts: ["bass", "keys"] })).toBe("Ask: bass, keys");
    expect(titleOf(ask, { at: { bar: 4 } })).toBe('Ask: {"bar":4}');
    for (const body of [{}, null, ["a"]]) expect(titleOf(ask, body)).toBe("Ask");
  });
});

describe("a thread is named in the words and field types in force when it opened (R-DECL-23)", () => {
  let room: FakeRoom;
  beforeEach(async () => {
    ({ room } = await startRoom());
  });
  afterEach(() => room.stop());

  test("after a later document relabels the act and exchanges its field types, the earlier thread keeps its name; a new thread is named under the new document", async () => {
    await room.activate({ ...CODE_REVIEW_ACTS, "start-song": SONG });
    const alice = await joinAs(room, "@alice");
    const before = ((await alice.api.acts()) as ActsCatalogue).acts["start-song"]!.binding;
    const first = (await alice.api.act("start-song", null, { key: "blue", title: "bossa", scope: ["songs/one/**"] }, { binding: before })) as DeclaredRecord;
    // The later document: another label, and `key` is now the text field.
    await room.activate({ ...CODE_REVIEW_ACTS, "start-song": { ...SWAPPED, label: "Begin a tune" } });
    const after = ((await alice.api.acts()) as ActsCatalogue).acts["start-song"]!.binding;
    expect(after).not.toBe(before);
    const second = (await alice.api.act("start-song", null, { key: "blue", title: "bossa", scope: ["songs/two/**"] }, { binding: after })) as DeclaredRecord;

    const title = async (id: string) => {
      const lane = (await alice.api.lane(id as never))!;
      const opening = (await alice.api.explain(lane.lane))!;
      const at = (await alice.api.actsAt({ seq: opening.entry.seq }))!;
      return threadTitle(lane, { meaning: meaningOf(at, "start-song"), body: envelopeOf(opening.entry)!.body });
    };
    expect(await title(first.id)).toBe("Start a song: bossa");
    expect(await title(second.id)).toBe("Begin a tune: blue");
    // Read under the active document instead, the earlier thread would be misnamed: that is why D(s) is used.
    const active = (await alice.api.acts()) as ActsCatalogue;
    const lane = (await alice.api.lane(first.id as never))!;
    const opening = (await alice.api.explain(lane.lane))!;
    expect(threadTitle(lane, { meaning: meaningOf(active, "start-song"), body: envelopeOf(opening.entry)!.body })).toBe("Begin a tune: blue");
  });

  test("a goal still comes first, and the thread's ID names it when the opening act is not at hand", () => {
    const opening = { meaning: declared(SONG), body: { key: "c", title: "Footprints" } };
    expect(threadTitle({ lane: "act_7_00000000", goal: "Rate-limit login" }, opening)).toBe("Rate-limit login");
    expect(threadTitle({ lane: "act_7_00000000", goal: "" }, opening)).toBe("Start a song: Footprints");
    expect(threadTitle({ lane: "act_7_00000000", goal: "" })).toBe("act_7_00000000");
  });
});
