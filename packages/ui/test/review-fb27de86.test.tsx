/**
 * Declared acts stage 5, the UI (request a5d64b35): the checker's three
 * preliminary findings, act fb27de86.
 *
 * 1. A field may be named `toString` or `valueOf` (R-DECL-12). The form and
 *    the body it reads keep such a field by its own name only.
 * 2. An answer that was lost is not a rejection (R-IDEM-2). The form says
 *    the outcome is unresolved, keeps the act and its idempotency key, and
 *    asks again with exactly those.
 * 3. An explicit read of the declarations is what later reads of `D(s)` are
 *    answered from (R-DECL-23).
 *
 * Each finding has its baselines beside it: the ordinary case that already
 * worked.
 */

import { cleanup, fireEvent, screen } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import { codeReviewPolicy, defaultPolicy, validatePolicyV2 } from "@generalbusiness/artroom-policy";
import { fieldsOf, newIdempotencyKey, readBody } from "../src/room/acts.ts";
import type { ActDeclaration, ActsCatalogue, Catalogue, DeclaredRecord, HttpRoom, Refusal } from "../src/room/contract.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { BAND } from "../src/room/mock/declared-room.ts";
import { MemoryRoom } from "../src/room/mock/memory-room.ts";
import { SETLIST_ACTS } from "../src/room/mock/setlist.ts";
import { renderAt, settled, waitFor } from "./helpers.tsx";

const adapters: LiveRoom[] = [];
afterEach(() => {
  cleanup();
  for (const a of adapters.splice(0)) a.stop();
  location.hash = "";
});

type Acts = Readonly<Record<string, ActDeclaration>>;

/** The setlist's acts, with one more text field on `start-song`. */
const withField = (name: string, optional: boolean): Acts => ({
  ...SETLIST_ACTS,
  "start-song": { ...SETLIST_ACTS["start-song"]!, body: { ...SETLIST_ACTS["start-song"]!.body, [name]: { type: "text", max: 80, ...(optional ? { optional: true } : {}) } } },
});

/** The fields of `start-song` with that field, from a document the policy validator accepts. */
function fieldsWith(name: string, optional: boolean) {
  const acts = withField(name, optional);
  const v = validatePolicyV2({ ...codeReviewPolicy(defaultPolicy()), acts });
  expect(v.ok ? [] : v.problems).toEqual([]);
  return fieldsOf(acts["start-song"]!, "none")!;
}

const song = { scope: "songs/local/**", title: "Local", key: "c", tempo: "120" };
const sent = { scope: ["songs/local/**"], title: "Local", key: "c", tempo: 120 };
const form = () => document.querySelector<HTMLFormElement>("form[data-act-form]")!;
const acts = (a: LiveRoom) => a.snapshot()!.feed.filter((e) => e.type === "act");

/** A room, its adapter, and the `start-song` form filled in. `paused` holds back the room's change notices. */
async function opened(declared: Acts = SETLIST_ACTS, paused = false) {
  const room = await MemoryRoom.found("the-band/setlist", BAND, { acts: declared });
  room.me = "@noor";
  if (paused) {
    const watch = room.watch.bind(room);
    room.watch = (cursor, _onUpdate) => watch(cursor, () => {});
  }
  const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor", () => new Date("2026-10-03T10:00:00Z"));
  adapters.push(adapter);
  await adapter.start();
  renderAt("#/acts", adapter);
  fireEvent.click(screen.getByRole("button", { name: "Prepare “Start a song”" }));
  await waitFor(() => expect(form()).not.toBeNull());
  fireEvent.input(screen.getByLabelText(/^scope/), { target: { value: song.scope } });
  fireEvent.input(screen.getByLabelText(/^title/), { target: { value: song.title } });
  fireEvent.change(screen.getByLabelText(/^key/), { target: { value: song.key } });
  fireEvent.input(screen.getByLabelText(/^tempo/), { target: { value: song.tempo } });
  return { room, adapter };
}

// ------------------------------------------------------------ 1. fields named like inherited properties

describe("fb27de86 finding 1: a field named toString or valueOf (R-DECL-12)", () => {
  test("baseline: an ordinary optional field left out gives a valid body without it", () => {
    expect(readBody(fieldsWith("caption", true), song)).toEqual({ ok: true, body: sent });
  });

  test.each(["toString", "valueOf"])("baseline: a value typed into the field %s is read as any field's is", (name) => {
    expect(readBody(fieldsWith(name, true), { ...song, [name]: "own value" })).toEqual({ ok: true, body: { ...sent, [name]: "own value" } });
  });

  test.each(["toString", "valueOf"])("an optional field %s left out is absent from the body: nothing is read from the prototype", (name) => {
    const fields = fieldsWith(name, true);
    const read = readBody(fields, song);
    expect(read).toEqual({ ok: true, body: sent });
    expect(read.ok && Object.hasOwn(read.body, name)).toBe(false);
  });

  test.each(["toString", "valueOf"])("a required field %s left out is one named problem, and no body", (name) => {
    expect(readBody(fieldsWith(name, false), song)).toEqual({ ok: false, problems: { [name]: `${name} is required.` } });
  });

  test("baseline: an ordinary optional field's control starts empty, with no problem shown", async () => {
    await opened(withField("caption", true));
    expect((screen.getByLabelText(/^caption/) as HTMLTextAreaElement).value).toBe("");
    expect(document.querySelector("[data-field='caption'] [role='alert']")).toBeNull();
  });

  test.each(["toString", "valueOf"])("the control of an optional field %s starts empty, with no problem shown, and the act is sent without it", async (name) => {
    const { room } = await opened(withField(name, true));
    expect((screen.getByLabelText(new RegExp(`^${name}`)) as HTMLTextAreaElement).value).toBe("");
    expect(document.querySelector(`[data-field='${name}'] [role='alert']`)).toBeNull();
    fireEvent.submit(form());
    await waitFor(() => expect(document.querySelector("[data-recorded]")).not.toBeNull());
    expect(room.sent.map((s) => s.body)).toEqual([sent]);
  });

  test.each(["toString", "valueOf"])("a required field %s left empty shows its own problem and sends nothing; once filled in, it is sent under its own name", async (name) => {
    const { room } = await opened(withField(name, false));
    fireEvent.submit(form());
    await waitFor(() => expect(document.querySelector(`[data-field='${name}'] [role='alert']`)?.textContent).toBe(`${name} is required.`));
    // No other field shows a problem, and nothing was sent.
    expect(document.querySelectorAll("[data-field] [role='alert']")).toHaveLength(1);
    expect(room.sent).toEqual([]);
    fireEvent.input(screen.getByLabelText(new RegExp(`^${name}`)), { target: { value: "said" } });
    fireEvent.submit(form());
    await waitFor(() => expect(document.querySelector("[data-recorded]")).not.toBeNull());
    expect(room.sent.map((s) => s.body)).toEqual([{ ...sent, [name]: "said" }]);
  });
});

// ------------------------------------------------------------ 2. an answer that was lost

/** The error a transport throws when it cannot say whether the room recorded the act. */
const lost = () => ({ name: "ArtroomError", code: "timeout", retryable: true, maybeRecorded: true, message: "The room's reply did not arrive." });
const NOT_TAKEN = "The room did not take the act";
const unresolved = () => document.querySelector<HTMLElement>("[data-unresolved]");
const again = () => fireEvent.click(screen.getByRole("button", { name: "Ask again, the same act" }));

/** Make the room lose its next `times` answers. With `recorded`, it admits the act first; without, it does not see it at all. */
function loseAnswers(room: MemoryRoom, times: number, recorded: boolean) {
  const act = room.act.bind(room);
  const count = { lost: 0 };
  room.act = async (...args) => {
    if (count.lost < times) {
      if (recorded) expect("refused" in (await act(...args))).toBe(false);
      count.lost += 1;
      throw lost();
    }
    return act(...args);
  };
  return count;
}

describe("fb27de86 finding 2: an answer that was lost is not a rejection (R-IDEM-2)", () => {
  test("baseline: an answer that arrives is shown as recorded, with no alert", async () => {
    const { room, adapter } = await opened();
    fireEvent.submit(form());
    await waitFor(() => expect(document.querySelector("[data-recorded]")).not.toBeNull());
    expect(room.sent).toHaveLength(1);
    await waitFor(() => expect(acts(adapter)).toHaveLength(1));
    expect(screen.queryByRole("alert")).toBeNull();
    // Every act the form sends carries an idempotency key of the room's form.
    expect(room.keys[0]).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  test("baseline: a failure that says nothing of a record keeps its wording: the room did not take the act", async () => {
    const { room } = await opened();
    room.act = async () => {
      throw { name: "ArtroomError", code: "bad-request", retryable: false, message: "The envelope is malformed." };
    };
    fireEvent.submit(form());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(`${NOT_TAKEN}: The envelope is malformed.`);
    expect(unresolved()).toBeNull();
    // The form can still be sent.
    expect(screen.getByRole("button", { name: "Send “Start a song”" })).not.toBeNull();
  });

  test("an act the room recorded, whose answer was lost, is shown as unresolved, never as not taken", async () => {
    const { room, adapter } = await opened();
    loseAnswers(room, 1, true);
    fireEvent.submit(form());
    const alert = await screen.findByRole("alert");
    expect(unresolved()).toBe(alert);
    expect(alert.textContent).toContain("The room's answer did not arrive");
    expect(alert.textContent).toContain("may have been recorded, or it may not: The room's reply did not arrive.");
    expect(alert.textContent).not.toContain(NOT_TAKEN);
    expect(document.querySelector("[data-recorded]")).toBeNull();
    // The room did record it, and the page's own feed shows it.
    await waitFor(() => expect(acts(adapter)).toHaveLength(1));
    // The notice names the key the act was sent with.
    expect(alert.querySelector("code")!.textContent).toBe(room.keys[0]);
  });

  test("the page reads the room again after a lost answer, also when the room sends it no notice of the change", async () => {
    const { room, adapter } = await opened(SETLIST_ACTS, true);
    loseAnswers(room, 1, true);
    fireEvent.submit(form());
    await screen.findByRole("alert");
    await waitFor(() => expect(acts(adapter)).toHaveLength(1));
  });

  test("asking again sends exactly the same act with the same key: the room answers with the record it made and records nothing new", async () => {
    const { room, adapter } = await opened();
    loseAnswers(room, 1, true);
    fireEvent.submit(form());
    await screen.findByRole("alert");
    again();
    await waitFor(() => expect(document.querySelector("[data-recorded]")).not.toBeNull());
    expect(room.sent).toHaveLength(2);
    expect(room.sent[1]).toEqual(room.sent[0]);
    expect(room.keys[1]).toBe(room.keys[0]);
    expect(room.keys[0]).toBeDefined();
    // One entry, and the notice names it.
    await waitFor(() => expect(acts(adapter)).toHaveLength(1));
    expect(document.querySelector<HTMLElement>("[data-recorded]")!.dataset["recorded"]).toBe((acts(adapter)[0] as { id: string }).id);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("asking again when the room never saw the act records it once", async () => {
    const { room, adapter } = await opened();
    const count = loseAnswers(room, 2, false);
    fireEvent.submit(form());
    await screen.findByRole("alert");
    again();
    // Lost a second time: unresolved again, with the same act kept.
    await waitFor(() => expect(count.lost).toBe(2));
    await waitFor(() => expect(unresolved()).not.toBeNull());
    again();
    await waitFor(() => expect(document.querySelector("[data-recorded]")).not.toBeNull());
    await waitFor(() => expect(acts(adapter)).toHaveLength(1));
    expect(room.sent).toHaveLength(1);
    expect(room.keys).toHaveLength(1);
  });

  test("while the answer is unresolved the form sends no new act", async () => {
    const { room } = await opened();
    loseAnswers(room, 1, true);
    fireEvent.submit(form());
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Send “Start a song”" })).toBeNull();
    // Editing a field and submitting the form by the keyboard sends nothing: the only act that can go is the one kept.
    fireEvent.input(screen.getByLabelText(/^title/), { target: { value: "Another" } });
    fireEvent.submit(form());
    await settled();
    expect(room.sent).toHaveLength(1);
    expect(unresolved()).not.toBeNull();
    again();
    await waitFor(() => expect(document.querySelector("[data-recorded]")).not.toBeNull());
    expect(room.sent.map((s) => (s.body as { title: string }).title)).toEqual(["Local", "Local"]);
  });

  test("asking again after the meaning changed is answered binding-stale: the form shows the new meaning and sends nothing by itself", async () => {
    const { room } = await opened();
    loseAnswers(room, 1, false);
    fireEvent.submit(form());
    await screen.findByRole("alert");
    await room.activate({ acts: { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, body: { ...SETLIST_ACTS["start-song"]!.body, feel: { type: "text", max: 20, optional: true } } } } });
    again();
    await waitFor(() => expect(document.querySelector("[data-stale]")).not.toBeNull());
    expect(unresolved()).toBeNull();
    // The one act the room saw was the kept one, under the binding the person had read.
    expect(room.sent).toHaveLength(1);
    expect(document.querySelector("[data-recorded]")).toBeNull();
  });
});

describe("fb27de86 finding 2: the stand-in room answers an idempotency key as the Room does (R-IDEM-2 to R-IDEM-4)", () => {
  const body = { scope: ["songs/local/**"], title: "Local", key: "c", tempo: 120 };
  async function room() {
    const r = await MemoryRoom.found("the-band/setlist", BAND, { acts: SETLIST_ACTS });
    r.me = "@noor";
    const binding = ((await r.acts()) as ActsCatalogue).acts["start-song"]!.binding;
    return { r, binding };
  }
  /** The log's head: it moves by one for every entry the room records. */
  const entries = (r: MemoryRoom) => r.log({ limit: 1 }).then((p) => p.head);

  test("the same act under the same key returns the record made the first time, and makes no second entry", async () => {
    const { r, binding } = await room();
    const key = newIdempotencyKey();
    const first = (await r.act("start-song", null, body, { binding, idempotencyKey: key })) as DeclaredRecord;
    const n = await entries(r);
    expect(await r.act("start-song", null, body, { binding, idempotencyKey: key })).toEqual(first);
    expect(await entries(r)).toBe(n);
  });

  test("another act under a used key is idempotency-mismatch, and records nothing", async () => {
    const { r, binding } = await room();
    const key = newIdempotencyKey();
    await r.act("start-song", null, body, { binding, idempotencyKey: key });
    const n = await entries(r);
    const other = (await r.act("start-song", null, { ...body, title: "Other", scope: ["songs/other/**"] }, { binding, idempotencyKey: key })) as Refusal;
    expect(other).toMatchObject({ refused: true, rule: "idempotency-mismatch" });
    expect(await entries(r)).toBe(n);
  });

  test("a refusal the room did not record leaves the key free: the corrected act under it is admitted", async () => {
    const { r, binding } = await room();
    const key = newIdempotencyKey();
    const stale = (await r.act("start-song", null, body, { binding: `sha256:${"0".repeat(64)}` as never, idempotencyKey: key })) as Refusal;
    expect(stale).toMatchObject({ refused: true, rule: "binding-stale" });
    expect(stale.act).toBeUndefined();
    const ok = await r.act("start-song", null, body, { binding, idempotencyKey: key });
    expect("refused" in ok).toBe(false);
  });

  test("two keys are two acts", () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^ui-[0-9a-f]{32}$/);
    expect(newIdempotencyKey()).not.toBe(a);
  });
});

// ------------------------------------------------------------ 3. an explicit read of the declarations

describe("fb27de86 finding 3: an explicit read of the declarations is what D(s) is answered from (R-DECL-23)", () => {
  /** An adapter that hears nothing from the room after it starts, and a count of its historical reads. */
  async function quiet() {
    const room = await MemoryRoom.found("the-band/setlist", BAND, { acts: SETLIST_ACTS });
    room.me = "@noor";
    const watch = room.watch.bind(room);
    room.watch = (cursor, _onUpdate) => watch(cursor, () => {});
    const historical: unknown[] = [];
    const actsAt = room.actsAt.bind(room);
    room.actsAt = async (at) => (historical.push(at), actsAt(at));
    const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor");
    adapters.push(adapter);
    await adapter.start();
    const old = (await room.acts()) as Catalogue;
    expect(await adapter.catalogueAt(old.since)).toEqual(old);
    historical.length = 0;
    return { room, adapter, old, historical };
  }

  test("baseline: with no activation, an explicit read keeps the catalogue, and D(s) is answered from it without asking the room", async () => {
    const { adapter, old, historical } = await quiet();
    expect(await adapter.readCatalogue()).toEqual(old);
    expect(await adapter.catalogueAt(old.since)).toEqual(old);
    expect(historical).toEqual([]);
  });

  test("after an activation and an explicit read, an act accepted later is read under the new policy, and an earlier entry under the old one", async () => {
    const { room, adapter, old } = await quiet();
    const next = await room.activate({ acts: { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, label: "Begin a tune", help: "New help for this version." } } });
    const fresh = (await adapter.readCatalogue()) as ActsCatalogue;
    expect(fresh.policy).toBe(next);
    expect(fresh.policy).not.toBe(old.policy);
    expect(adapter.snapshot()!.catalogue!.policy).toBe(next);
    const entry = (await room.act("start-song", null, { scope: ["songs/after/**"], title: "After", key: "c", tempo: 120 }, { binding: fresh.acts["start-song"]!.binding })) as DeclaredRecord;
    expect(entry.seq).toBeGreaterThan(fresh.since);
    const at = (await adapter.catalogueAt(entry.seq)) as ActsCatalogue;
    expect(at.policy).toBe(next);
    expect(at.acts["start-song"]!.declaration.label).toBe("Begin a tune");
    // The entry from before the activation keeps the label of its own time, and its interval now has an end.
    const before = (await adapter.catalogueAt(old.since)) as ActsCatalogue;
    expect(before.policy).toBe(old.policy);
    expect(before.until).toBe(fresh.since);
    expect(before.acts["start-song"]!.declaration.label).toBe("Start a song");
  });

  test("after a kind is retired and an explicit read, the old catalogue is read with its end and the kind's retired mark", async () => {
    const { room, adapter, old } = await quiet();
    const { cue: _retired, ...withoutCue } = SETLIST_ACTS;
    await room.activate({ acts: withoutCue });
    const fresh = (await adapter.readCatalogue())!;
    const expected = (await room.actsAt({ seq: old.since })) as ActsCatalogue;
    expect(expected.until).toBe(fresh.since);
    expect(expected.acts["cue"]!.retired).toBe(fresh.since);
    expect(await adapter.catalogueAt(old.since)).toEqual(expected);
  });
});
