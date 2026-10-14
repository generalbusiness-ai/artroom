/**
 * Declared acts stage 5, the UI (request a5d64b35, clarification fa120186):
 * every record is shown under the declarations in force at its own seq,
 * `D(s)`, never under the active ones (R-DECL-23).
 *
 * The room is the in-memory one (src/room/mock/memory-room.ts) behind the
 * live adapter, so these run the code a real room's records go through.
 */

import { cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import { CODE_REVIEW_ACTS } from "@generalbusiness/artroom-policy/declared";
import type { FeedEntry, RoomSnapshot } from "../src/room/adapter.ts";
import type { ActDeclaration, ActId, ActsCatalogue, DeclaredRecord, HttpRoom, MemberId, Result, Sha } from "../src/room/contract.ts";
import { isRefusal } from "../src/room/contract.ts";
import { describeEntry, entryId } from "../src/room/live/describe.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { BAND, SETLIST_ACTS_2, declaredDemo } from "../src/room/mock/declared-room.ts";
import { MemoryRoom, type MemoryDoc } from "../src/room/mock/memory-room.ts";
import { SETLIST_ACTS } from "../src/room/mock/setlist.ts";
import { laneGoal } from "../src/ui/format.ts";
import { renderAt, waitFor } from "./helpers.tsx";

afterEach(() => {
  cleanup();
  location.hash = "";
});

const sha = (c: string) => c.repeat(40) as Sha;
const ok = (r: Result<DeclaredRecord>) => {
  if (isRefusal(r)) return expect.fail(`refused: ${r.rule}: ${r.reason}`);
  return r;
};

async function room(doc: MemoryDoc = { acts: SETLIST_ACTS }) {
  return MemoryRoom.found("the-band/setlist", BAND, doc);
}

/** Act as `by` under the active binding of `kind`. */
async function act(r: MemoryRoom, by: MemberId, kind: string, target: unknown, body: Record<string, unknown>) {
  r.me = by;
  const c = await r.acts();
  if (c.vocabulary !== "declared") throw new Error("no declarations");
  return ok(await r.act(kind, target as never, body as never, { binding: c.acts[kind]!.binding }));
}

const song = (r: MemoryRoom, by: MemberId = "@noor", title = "Blue Bossa") => act(r, by, "start-song", null, { title, key: "c", tempo: 132, scope: [`songs/${title.toLowerCase().replace(/ /g, "-")}/**`] });

async function live(r: MemoryRoom, me: MemberId = "@noor") {
  const adapter = new LiveRoom(r as unknown as HttpRoom, me, () => new Date("2026-10-03T10:00:00Z"));
  await adapter.start();
  return adapter;
}

const entry = (s: RoomSnapshot, id: ActId): FeedEntry => s.feed.find((f) => f.id === id)!;

/** Wait until the adapter's snapshot has caught up with the room's log. */
async function settled(adapter: LiveRoom, r: MemoryRoom) {
  const head = (await r.log({ after: -1, limit: 1000 })).head;
  await waitFor(() => expect(adapter.snapshot()!.log.head).toBe(head));
  // One more turn, so a refresh that was already running has delivered the catalogues too.
  await waitFor(async () => expect(adapter.snapshot()!.catalogue?.policy).toBe((await r.acts()).policy));
  return adapter.snapshot()!;
}

describe("activation: a declared record shows its label, its target and its fields", () => {
  test("an act of an application's own kind is a sentence with the label, and its typed fields by name", async () => {
    const r = await room();
    const s1 = await song(r);
    const part = await act(r, "@noor", "add-part", { lane: s1.id }, { lease: 1, expectedGeneration: 0, head: sha("a"), instrument: "bass", section: "head", bars: 16, charts: ["charts/bass.pdf"] });
    const snap = (await live(r)).snapshot()!;
    const opened = entry(snap, s1.id);
    expect(opened.text).toBe("@noor: Start a song.");
    expect(opened.kind).toBe("start-song");
    expect(opened.meaning).toMatchObject({ vocabulary: "declared", label: "Start a song", kind: "start-song", target: null });
    expect(opened.meaning!.fields).toEqual([
      { name: "title", value: "Blue Bossa" },
      { name: "key", value: "c" },
      { name: "tempo", value: "132" },
      { name: "scope", value: "songs/blue-bossa/**" },
    ]);
    const added = entry(snap, part.id);
    expect(added.text).toBe("@noor: Add a part.");
    expect(added.meaning!.target).toBe(`Thread ${s1.id}`);
    expect(added.meaning!.fields.find((f) => f.name === "charts")).toEqual({ name: "charts", value: "charts/bass.pdf" });
    expect(added.lane).toBe(s1.id);
    // The catalogue and the policy version come from the room.
    expect(snap.catalogue).toMatchObject({ vocabulary: "declared", since: 1, until: null });
    expect(snap.policy).toMatchObject({ version: snap.catalogue!.policy, activatedAt: 1 });
  });

  test("the feed shows the record's label, target and fields, and the thread is named by the act that opened it", async () => {
    const r = await room();
    const s1 = await song(r);
    await act(r, "@keys-bot", "cue", { act: s1.id }, { signal: "count-in", to: "@noor" });
    renderAt("#/room", await live(r));
    const records = [...document.querySelectorAll<HTMLElement>("[data-record]")];
    expect(records.map((x) => x.dataset["record"])).toEqual(["cue", "start-song"]);
    const cue = records[0]!;
    expect(cue.textContent).toContain("Cue");
    expect(within(cue).getByText("signal").nextElementSibling!.textContent).toBe("count-in");
    expect(within(cue).getByText("to").nextElementSibling!.textContent).toBe("@noor");
    expect(within(cue).getByText("On").nextElementSibling!.textContent).toBe(`Entry ${s1.id}`);
    expect(screen.getByText("@keys-bot: Cue.")).toBeTruthy();
    // A thread with no goal is named by its opening act, in that act's own words.
    // Named by the one rule every reader uses: the opening act's label and its first text field by name. `key` comes
    // first by name, but it is an enum; `title` is the text a person wrote.
    expect(screen.getByRole("link", { name: "Start a song: Blue Bossa" }).getAttribute("href")).toBe(`#/lane/${s1.id}`);
  });

  test("a review or a comment under an application's own name is still evidence for the review screens, by its step", async () => {
    const r = await room();
    const s1 = await song(r);
    await act(r, "@noor", "add-part", { lane: s1.id }, { lease: 1, expectedGeneration: 0, head: sha("a"), instrument: "bass", section: "head", bars: 16 });
    const signed = await act(r, "@ivo", "sign-off", { lane: s1.id, generation: 1 }, { head: sha("a"), verdict: "approve", scope: ["songs/**"], text: "Sits well." });
    await act(r, "@keys-bot", "cue", { act: s1.id }, { signal: "head" });
    const snap = (await live(r)).snapshot()!;
    expect(snap.reviews).toHaveLength(1);
    expect(snap.reviews[0]).toMatchObject({ id: signed.id, kind: "review", lane: s1.id, generation: 1, verdict: "approve", text: "Sits well." });
    // A cue is a comment with no text: it is not one of the review screens' notes.
    expect(snap.notes).toEqual([]);
    expect(snap.checks).toEqual([]);
    // A review step's `text` is the application's field. Where it is not text, the review screens show none.
    const c = await r.acts();
    const binding = c.vocabulary === "declared" ? c.acts["sign-off"]!.binding : "";
    const odd = r.record("@ivo", { v: 2, kind: "sign-off", binding, target: { lane: s1.id, generation: 1 }, body: { head: sha("a"), verdict: "approve", scope: ["songs/**"], text: 7 } });
    const after = (await live(r)).snapshot()!;
    expect(after.reviews.find((x) => x.id === odd)).toMatchObject({ verdict: "approve", text: "" });
  });
});

describe("old records keep the meaning they had", () => {
  test("label-only change: the old record shows the old label, a new one the new label, under one binding", async () => {
    const r = await room();
    const s1 = await song(r);
    const before = await act(r, "@keys-bot", "cue", { act: s1.id }, { signal: "head" });
    await r.activate({ acts: SETLIST_ACTS_2 });
    const after = await act(r, "@keys-bot", "cue", { act: s1.id }, { signal: "ending" });
    const snap = (await live(r)).snapshot()!;
    expect(entry(snap, before.id).text).toBe("@keys-bot: Cue.");
    expect(entry(snap, before.id).meaning!.label).toBe("Cue");
    expect(entry(snap, after.id).text).toBe("@keys-bot: Signal the band.");
    expect(entry(snap, after.id).meaning!.label).toBe("Signal the band");
    expect(entry(snap, after.id).meaning!.binding).toBe(entry(snap, before.id).meaning!.binding);
    expect(entry(snap, before.id).meaning!.retired).toBeUndefined();
    expect(entry(snap, before.id).meaning!.policy).not.toBe(entry(snap, after.id).meaning!.policy);
  });

  test("retirement: a record of a kind a later policy dropped says where it was retired, and still shows its label and fields", async () => {
    const r = await room();
    const s1 = await song(r);
    const wrapped = await act(r, "@noor", "wrap-up", { lane: s1.id }, { lease: 1, note: "Done for today." });
    const adapter = await live(r);
    expect(entry(adapter.snapshot()!, wrapped.id).meaning!.retired).toBeUndefined();
    await r.activate({ acts: SETLIST_ACTS_2 });
    const retiredAt = (await r.acts()).since;
    const snap = await settled(adapter, r);
    // The same adapter, after the activation: the earlier catalogue is read again, so the retirement shows.
    expect(entry(snap, wrapped.id).meaning).toMatchObject({ label: "Wrap up", retired: retiredAt, fields: [{ name: "lease", value: "1" }, { name: "note", value: "Done for today." }] });
    expect(snap.catalogue!.vocabulary === "declared" && Object.keys(snap.catalogue!.acts)).not.toContain("wrap-up");
    renderAt("#/room", adapter);
    const shown = document.querySelector<HTMLElement>("[data-record='wrap-up']")!;
    expect(shown.textContent).toContain("Wrap up");
    expect(shown.textContent).toContain(`Retired at seq ${retiredAt}`);
    expect(screen.getByText("@noor: Wrap up.")).toBeTruthy();
  });

  test("name reuse with a changed shape: the old record keeps the old meaning and its retirement; the new record has the new one", async () => {
    const r = await room();
    const s1 = await song(r);
    const old = await act(r, "@noor", "wrap-up", { lane: s1.id }, { lease: 1 });
    await r.activate({ acts: SETLIST_ACTS_2 });
    const retiredAt = (await r.acts()).since;
    // A third version declares the name again, as a comment on an entry with its own field.
    const reused: ActDeclaration = { label: "Wrap up the set", targets: { entry: ["comment"] }, body: { encore: { type: "bool" } }, who: { roles: ["member"] } };
    await r.activate({ acts: { ...SETLIST_ACTS_2, "wrap-up": reused } });
    const again = await act(r, "@noor", "wrap-up", { act: s1.id }, { encore: true });
    const snap = (await live(r)).snapshot()!;
    const a = entry(snap, old.id).meaning!;
    const b = entry(snap, again.id).meaning!;
    expect(a).toMatchObject({ label: "Wrap up", retired: retiredAt, target: `Thread ${s1.id}`, fields: [{ name: "lease", value: "1" }] });
    expect(b).toMatchObject({ label: "Wrap up the set", target: `Entry ${s1.id}`, fields: [{ name: "encore", value: "yes" }] });
    expect(b.retired).toBeUndefined();
    expect(a.binding).not.toBe(b.binding);
    expect(entry(snap, old.id).text).toBe("@noor: Wrap up.");
    expect(entry(snap, again.id).text).toBe("@noor: Wrap up the set.");
  });

  test("a legacy record keeps the sentence it always had, after the room moves to declared acts", async () => {
    const r = await room("legacy");
    const claimed = r.record("@noor", { v: 1, kind: "claim", target: null, body: { goal: "Rate-limit /api/login", scope: ["src/api/**"] } });
    const reviewed = r.record("@ivo", { v: 1, kind: "review", target: { lane: claimed, generation: 1 }, body: { head: sha("a"), verdict: "approve", scope: ["src/api/**"], text: "Good." } });
    const adapter = await live(r);
    expect(adapter.snapshot()!.catalogue).toMatchObject({ vocabulary: "artroom-legacy-v1" });
    await r.activate({ acts: SETLIST_ACTS });
    const replacedAt = (await r.acts()).since;
    const s1 = await song(r);
    const snap = await settled(adapter, r);
    expect(entry(snap, claimed).text).toBe("@noor claimed “Rate-limit /api/login”.");
    expect(entry(snap, reviewed).text).toBe("@ivo approved generation 1.");
    expect(entry(snap, claimed).meaning).toMatchObject({ vocabulary: "artroom-legacy-v1", label: "Claim", retired: replacedAt });
    expect(snap.reviews.map((x) => x.id)).toEqual([reviewed]);
    expect(entry(snap, s1.id).text).toBe("@noor: Start a song.");
    // Legacy records get no generic field list in the feed: they read as they always did.
    renderAt("#/room", adapter);
    expect([...document.querySelectorAll<HTMLElement>("[data-record]")].map((x) => x.dataset["record"])).toEqual(["start-song"]);
    expect(screen.getByText("@noor claimed “Rate-limit /api/login”.")).toBeTruthy();
  });

  test("a platform act reads the same in every room", async () => {
    const r = await room();
    const s1 = await song(r);
    const renewed = r.record("@noor", { v: 1, kind: "renew", target: { lane: s1.id }, body: { lease: 1 } });
    const recovered = r.record("@sam", { v: 1, kind: "recover", target: null, body: { op: "open", goal: "repair", scope: [".artroom/**"] } });
    const snap = (await live(r)).snapshot()!;
    expect(entry(snap, renewed).text).toBe("@noor renewed a lease.");
    expect(entry(snap, renewed).meaning!.vocabulary).toBe("platform");
    expect(entry(snap, recovered).text).toBe("@sam ran a recovery step (open).");
  });
});

describe("a record whose kind had no meaning is shown plainly, never dropped", () => {
  test("a kind the policy in force did not declare: its kind, its fields, and a plain statement", async () => {
    const r = await room();
    const odd = r.record("@ivo", { v: 2, kind: "riff", binding: `sha256:${"9".repeat(64)}`, target: null, body: { bars: 4 } });
    const refused = r.record("@ivo", { v: 2, kind: "riff", binding: `sha256:${"9".repeat(64)}`, target: null, body: { bars: 8 } }, { refused: true, rule: "policy:no-riffs", reason: "No riffs in the head.", fix: "Wait for the solo." } as never);
    const adapter = await live(r);
    const snap = adapter.snapshot()!;
    expect(snap.feed).toHaveLength(4);
    expect(entry(snap, odd).text).toBe("@ivo recorded an act of kind riff. The policy in force then did not declare it.");
    expect(entry(snap, odd).meaning).toMatchObject({ vocabulary: "unknown", label: "riff", fields: [{ name: "bars", value: "4" }] });
    expect(entry(snap, refused).text).toBe("@ivo's riff was refused: policy:no-riffs.");
    renderAt("#/room", adapter);
    const shown = [...document.querySelectorAll<HTMLElement>("[data-record='riff']")];
    expect(shown).toHaveLength(2);
    expect(shown[0]!.textContent).toContain("Not declared at this entry");
    // A refusal shows its reason and fix as given.
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("No riffs in the head.");
    expect(alert.textContent).toContain("Wait for the solo.");
  });

  test("when the room cannot give its declarations, only a v: 1 record of a legacy kind is read as one", async () => {
    const r = await room("legacy");
    const claimed = r.record("@noor", { v: 1, kind: "claim", target: null, body: { goal: "A goal", scope: ["a/**"] } });
    const v2claim = r.record("@noor", { v: 2, kind: "claim", binding: `sha256:${"7".repeat(64)}`, target: null, body: { goal: "Looks like a claim", scope: ["b/**"] } });
    const strange = r.record("@noor", { v: 1, kind: "riff", target: null, body: {} });
    // An older room: it has no acts read at all.
    const old = Object.create(r) as MemoryRoom;
    Object.defineProperty(old, "acts", { value: undefined });
    Object.defineProperty(old, "actsAt", { value: undefined });
    const adapter = await live(old);
    expect(adapter.snapshot()).not.toBeNull();
    const snap = adapter.snapshot()!;
    expect(snap.catalogue).toBeNull();
    expect(snap.source.status).toBe("live");
    expect(entry(snap, claimed).text).toBe("@noor claimed “A goal”.");
    expect(entry(snap, claimed).meaning).toBeUndefined();
    expect(entry(snap, v2claim).text).toBe("@noor recorded an act of kind claim. Its meaning could not be read from this room.");
    expect(entry(snap, strange).text).toBe("@noor recorded an act of kind riff. Its meaning could not be read from this room.");
    renderAt("#/acts", adapter);
    expect(document.querySelector("[data-acts='unavailable']")!.textContent).toBe("This connection cannot read the room's acts.");
  });
});

describe("the sentence table is only for the kinds it was written for", () => {
  test("a kind it has no sentence for falls back to the plain statement, whatever vocabulary it is read under", async () => {
    const r = await room("legacy");
    const id = r.record("@ivo", { v: 1, kind: "riff", target: null, body: {} });
    const e = (await r.log()).acts.find((x) => x.seq === 2)!;
    expect(entryId(e)).toBe(id);
    const policy = (await r.acts()).policy;
    expect(describeEntry(e, { meaning: { vocabulary: "artroom-legacy-v1", policy, kind: "riff", label: "Riff" } }).text).toBe("@ivo recorded an act of kind riff.");
    expect(describeEntry(e, { meaning: { vocabulary: "platform", policy, kind: "riff", label: "Riff" } }).text).toBe("@ivo recorded an act of kind riff.");
  });
});

describe("the code-review sentences belong to the code-review declarations, by binding and not by name", () => {
  test("a v2 room with the code-review declarations keeps the review sentences; a room that means something else by claim does not", async () => {
    const review = await room({ acts: CODE_REVIEW_ACTS });
    const c1 = await act(review, "@noor", "claim", null, { goal: "Rate-limit /api/login", scope: ["src/api/**"] });
    const snap1 = (await live(review)).snapshot()!;
    expect(entry(snap1, c1.id).text).toBe("@noor claimed “Rate-limit /api/login”.");
    expect(entry(snap1, c1.id).meaning).toMatchObject({ vocabulary: "declared", label: "Claim" });

    const other: ActDeclaration = { label: "Claim a seat", targets: { none: ["open"] }, body: { goal: { type: "text", max: 80 }, row: { type: "int", min: 1, max: 40 } }, who: { roles: ["member"] }, hold: { scope: "body.scope", workspace: true } };
    const seats = await room({ acts: { claim: other } });
    const c2 = await act(seats, "@noor", "claim", null, { goal: "Front row", row: 1, scope: ["seats/1/**"] });
    const snap2 = (await live(seats)).snapshot()!;
    expect(entry(snap2, c2.id).text).toBe("@noor: Claim a seat.");
    const refused = seats.record("@ivo", { v: 2, kind: "claim", binding: (await seats.acts() as never as { acts: Record<string, { binding: string }> }).acts["claim"]!.binding, target: null, body: { goal: "Front row", row: 1, scope: ["seats/1/**"] } }, { refused: true, rule: "scope-overlap", reason: "Taken.", fix: "Pick another." } as never);
    expect(entry((await live(seats)).snapshot()!, refused).text).toBe("@ivo's “Claim a seat” was refused: scope-overlap.");
  });
});

describe("the why panel reads a record under its own entry's policy", () => {
  test("it shows what the kind meant at that entry, its fields, and that a later policy dropped it", async () => {
    const r = await room();
    const s1 = await song(r);
    const wrapped = await act(r, "@noor", "wrap-up", { lane: s1.id }, { lease: 1 });
    await r.activate({ acts: SETLIST_ACTS_2 });
    const retiredAt = (await r.acts()).since;
    const adapter = await live(r);
    const why = (await adapter.explain(wrapped.id))!;
    expect(why.title).toBe("@noor: Wrap up.");
    expect(why.meaning).toMatchObject({ label: "Wrap up", retired: retiredAt, target: `Thread ${s1.id}` });
    renderAt("#/room", adapter);
    const item = document.querySelector<HTMLElement>("[data-record='wrap-up']")!.closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: "Why" }));
    const dialog = await waitFor(() => {
      const d = document.querySelector<HTMLElement>("dialog.why [data-meaning]");
      expect(d).not.toBeNull();
      return d!;
    });
    expect(dialog.dataset["meaning"]).toBe("declared");
    expect(dialog.textContent).toContain(`What it meant at entry ${wrapped.seq}`);
    expect(dialog.textContent).toContain(`A later policy dropped this kind at seq ${retiredAt}. This record keeps the meaning it had.`);
    expect(dialog.textContent).toContain("Wrap up");
  });

  test("the meaning the room computed is the one shown", async () => {
    const r = await room();
    const s1 = await song(r);
    const told = Object.create(r) as MemoryRoom;
    told.explain = async (a: ActId) => {
      const x = (await r.explain(a))!;
      return { ...x, meaning: { ...(x as { meaning: { label: string } }).meaning, label: "As the room explained it" } } as never;
    };
    const why = (await (await live(told)).explain(s1.id))!;
    expect(why.meaning!.label).toBe("As the room explained it");
    expect(why.title).toBe("@noor: As the room explained it.");
  });
});

describe("the demo room: an application that is not code review, end to end", () => {
  test("its feed, threads and acts are in its own words, and none of the review verbs appears", async () => {
    const { adapter } = await declaredDemo();
    expect(adapter.kind).toBe("mock");
    const snap = adapter.snapshot()!;
    expect(snap.source).toMatchObject({ kind: "mock", status: "live" });
    expect(snap.feed.filter((f) => f.type === "act").map((f) => f.text)).toEqual([
      "@noor: Start a song.",
      "@noor: Add a part.",
      "@keys-bot: Cue.",
      "@ivo: Sign off.",
      "@noor: Wrap up.",
      "@ivo: Start a song.",
    ]);
    const { container } = renderAt("#/room", adapter);
    const text = container.querySelector("ol.feed")!.parentElement!.textContent!;
    for (const verb of ["claimed", "proposed", "approved generation", "wrote a note", "asked to land"]) expect(text).not.toContain(verb);
    // Both songs are in the key of c. A thread with no goal is named by its opening act's first text field, its title.
    expect(screen.queryAllByRole("link", { name: "Start a song: c" })).toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "Start a song: Blue Bossa" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Start a song: Footprints" })).toHaveLength(1);
    expect(document.querySelector("[data-record='wrap-up']")!.textContent).toContain("Retired at seq");
    // The viewer can be switched, as in the scripted demo.
    expect(adapter.viewers).toEqual(["@noor", "@ivo", "@keys-bot", "@sam"]);
  });
});

// A thread with no goal is named by its opening act's label and its first text field by name, read with the
// declaration in force when the thread opened (section 33.10; the planner's decision c37653e1). The page gets that
// declaration with each feed entry's meaning and gives it to the helper every reader shares.
describe("the page names a thread by its opening act's first text field (section 33.10)", () => {
  const adapters: LiveRoom[] = [];
  afterEach(() => {
    for (const a of adapters.splice(0)) a.stop();
  });

  const SONG = SETLIST_ACTS["start-song"]!;

  async function open(acts: Readonly<Record<string, ActDeclaration>> = SETLIST_ACTS) {
    const room = await MemoryRoom.found("the-band/setlist", BAND, { acts });
    room.me = "@noor";
    const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor");
    adapters.push(adapter);
    await adapter.start();
    return { room, adapter };
  }

  async function start(room: MemoryRoom, body: Parameters<MemoryRoom["act"]>[2]): Promise<DeclaredRecord> {
    const binding = ((await room.acts()) as ActsCatalogue).acts["start-song"]!.binding;
    const r = await room.act("start-song", null, body, { binding });
    expect("refused" in r).toBe(false);
    return r as DeclaredRecord;
  }

  test("the title names the song, though the enum field key comes first by name", async () => {
    const { room, adapter } = await open();
    const song = await start(room, { title: "Footprints", key: "c", tempo: 96, scope: ["songs/footprints/**"] });
    await waitFor(() => expect(adapter.snapshot()!.lanes).toHaveLength(1));
    const snap = adapter.snapshot()!;
    expect(laneGoal(snap, song.id)).toBe("Start a song: Footprints");
    // The entry's meaning carries the declaration of its own seq, which is where the field types come from.
    expect(snap.feed.find((f) => f.id === song.id)!.meaning!.declaration).toEqual(SONG);
  });

  test("a thread keeps the name its own declaration gave it after a later document relabels the act and makes another field the text one", async () => {
    const { room, adapter } = await open();
    const first = await start(room, { title: "Footprints", key: "c", tempo: 96, scope: ["songs/footprints/**"] });
    // The later document: `key` is now text, and `title` is one of a fixed list.
    const later: ActDeclaration = { ...SONG, label: "Begin a tune", body: { ...SONG.body, key: { type: "text", max: 8 }, title: { type: "enum", values: ["so-what", "nardis"] } } };
    await room.activate({ acts: { ...SETLIST_ACTS, "start-song": later } });
    const second = await start(room, { title: "so-what", key: "d", tempo: 136, scope: ["songs/so-what/**"] });
    await waitFor(() => expect(adapter.snapshot()!.lanes).toHaveLength(2));
    const snap = adapter.snapshot()!;
    expect(laneGoal(snap, first.id)).toBe("Start a song: Footprints");
    expect(laneGoal(snap, second.id)).toBe("Begin a tune: d");
  });

  test("an act with no text field is still named by its first field by name, and a thread with a goal by its goal", async () => {
    const plain: ActDeclaration = { ...SONG, body: { key: SONG.body!["key"]!, tempo: SONG.body!["tempo"]! } };
    const { room, adapter } = await open({ ...SETLIST_ACTS, "start-song": plain });
    const song = await start(room, { key: "c", tempo: 96, scope: ["songs/untitled/**"] });
    await waitFor(() => expect(adapter.snapshot()!.lanes).toHaveLength(1));
    expect(laneGoal(adapter.snapshot()!, song.id)).toBe("Start a song: c");
    expect(laneGoal(adapter.snapshot()!, "act_999_00000000" as never)).toBe("an unknown lane");
  });
});
