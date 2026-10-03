/**
 * Declared acts stage 5, the UI (request a5d64b35): the Acts screen lists
 * the room's declarations, builds a form from one, checks the declared
 * limits before sending, sends with the binding the person was looking at,
 * and never resubmits a stale act on its own.
 */

import { cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import type { ActDeclaration, ActsCatalogue, HttpRoom, MemberId } from "../src/room/contract.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { BAND, SETLIST_ACTS_2, declaredDemo } from "../src/room/mock/declared-room.ts";
import { MemoryRoom, type MemoryDoc } from "../src/room/mock/memory-room.ts";
import { SETLIST_ACTS } from "../src/room/mock/setlist.ts";
import { renderAt, settled, waitFor } from "./helpers.tsx";

afterEach(() => {
  cleanup();
  location.hash = "";
});

async function open(doc: MemoryDoc = { acts: SETLIST_ACTS }, me: MemberId = "@noor") {
  const room = await MemoryRoom.found("the-band/setlist", BAND, doc);
  room.me = me;
  const adapter = new LiveRoom(room as unknown as HttpRoom, me, () => new Date("2026-10-03T10:00:00Z"), { source: "mock", viewers: BAND.map((p) => p.handle), onViewer: (m) => (room.me = m) });
  await adapter.start();
  return { room, adapter };
}

const bindingOf = async (room: MemoryRoom, kind: string) => ((await room.acts()) as ActsCatalogue).acts[kind]!.binding;
const input = (label: RegExp | string, value: string) => fireEvent.input(screen.getByLabelText(label), { target: { value } });
const choose = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const field = (name: string) => document.querySelector<HTMLElement>(`[data-field='${name}']`)!;
const form = () => document.querySelector<HTMLFormElement>("form[data-act-form]")!;
const submit = () => fireEvent.submit(form());

/** Go to an act's form from the list, as a person does. */
async function prepare(label: string) {
  fireEvent.click(screen.getByRole("button", { name: `Prepare “${label}”` }));
  await waitFor(() => expect(form()).not.toBeNull());
}

async function fillSong(title = "Footprints") {
  input(/^scope/, "songs/footprints/**");
  input(/^title/, title);
  choose(/^key/, "c");
  input(/^tempo/, "96");
}

describe("the list of acts", () => {
  test("every declaration is listed with its label, help, who may sign and what it acts on, in the room's words", async () => {
    const { adapter } = await open();
    renderAt("#/acts", adapter);
    const acts = [...document.querySelectorAll<HTMLElement>("li[data-act]")];
    expect(acts.map((a) => a.dataset["act"])).toEqual(["start-song", "add-part", "cue", "sign-off", "wrap-up"]);
    const first = acts[0]!;
    expect(first.textContent).toContain("Start a song");
    expect(first.textContent).toContain("Opens a thread for one song. Its scope is the files you will write.");
    expect(first.textContent).toContain("Admins, and anyone with the role member or agent.");
    expect(first.textContent).toContain("Starts something new");
    expect(acts[3]!.textContent).toContain("Admins, and anyone with the role maintainer or member.");
    expect(acts[3]!.textContent).toContain("On a version of a thread");
    expect(screen.getByRole("navigation", { name: "Screens" }).textContent).toContain("Acts");
    const page = document.querySelector("main")!.textContent!;
    for (const verb of ["Claim", "Propose", "Review", "Land", "Release"]) expect(page).not.toContain(verb);
  });

  test("a room on the built-in review acts says so, and offers no form", async () => {
    renderAt("#/acts");
    expect(document.querySelector("[data-acts='legacy']")!.textContent).toContain("This room uses the built-in review acts: claim, propose, note, review, check, land and release.");
    expect(document.querySelector("form")).toBeNull();
    const { adapter } = await open("legacy");
    cleanup();
    renderAt("#/acts", adapter);
    expect(document.querySelector("[data-acts='legacy']")).not.toBeNull();
  });

  test("an address that names an act the room does not declare says so", async () => {
    const { adapter } = await open();
    renderAt("#/acts/claim", adapter);
    expect(document.querySelector("[data-acts='no-such-act']")!.textContent).toBe("This room's policy does not declare an act called claim.");
    expect(document.querySelector("form")).toBeNull();
  });
});

describe("the form is built from the declaration: one input per field, by type", () => {
  test("text, enum, int, bool and the step's globs, with required and optional marked and the limits stated", async () => {
    const { adapter } = await open();
    renderAt("#/acts", adapter);
    await prepare("Start a song");
    expect([...document.querySelectorAll<HTMLElement>("[data-field]")].map((f) => f.dataset["field"])).toEqual(["scope", "title", "key", "tempo", "swing"]);
    expect(field("scope").querySelector("textarea")).not.toBeNull();
    expect(field("scope").textContent).toContain("needed by the step open");
    expect(field("title").querySelector("textarea")).not.toBeNull();
    expect(field("title").textContent).toContain("(required)");
    expect(field("title").textContent).toContain("text, up to 80 bytes");
    expect([...field("key").querySelectorAll("option")].map((o) => o.value)).toEqual(["", "c", "d", "e-flat", "f", "g", "a", "b-flat"]);
    expect(field("tempo").querySelector("input")!.getAttribute("inputmode")).toBe("numeric");
    expect(field("tempo").textContent).toContain("a whole number from 40 to 240");
    expect([...field("swing").querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Leave out", "Yes", "No"]);
    expect(field("swing").textContent).toContain("(optional)");
    // An act with no target asks for none.
    expect(document.querySelector("[data-target]")).toBeNull();
  });

  test("segment, globs, a thread to act on, and the version step's own fields", async () => {
    const { room, adapter } = await open();
    const song = await room.act("start-song", null, { title: "Blue Bossa", key: "c", tempo: 132, scope: ["songs/blue-bossa/**"] }, { binding: await bindingOf(room, "start-song") });
    await waitFor(() => expect(adapter.snapshot()!.lanes).toHaveLength(1));
    renderAt("#/acts", adapter);
    await prepare("Add a part");
    expect([...document.querySelectorAll<HTMLElement>("[data-field]")].map((f) => f.dataset["field"])).toEqual(["lease", "expectedGeneration", "head", "instrument", "section", "bars", "charts", "summary"]);
    expect(field("section").textContent).toContain("one path segment, with no slash");
    expect(field("charts").querySelector("textarea")).not.toBeNull();
    expect(field("charts").textContent).toContain("path patterns, one per line, up to 8");
    expect(field("head").textContent).toContain("a commit, 40 hex digits");
    const thread = screen.getByLabelText(/^Thread/) as HTMLSelectElement;
    expect([...thread.options].map((o) => o.textContent)).toEqual(["Choose a thread", "Start a song: Blue Bossa"]);
    expect([...thread.options][1]!.value).toBe("id" in song ? song.id : "");
  });

  test("member, an entry to act on, and an optional entry field", async () => {
    const { adapter } = await open();
    renderAt("#/acts", adapter);
    await prepare("Cue");
    expect([...document.querySelectorAll<HTMLElement>("[data-field]")].map((f) => f.dataset["field"])).toEqual(["replyTo", "signal", "to", "about"]);
    expect([...field("to").querySelectorAll("option")].map((o) => o.value)).toEqual(["", "@noor", "@ivo", "@keys-bot", "@sam"]);
    expect(field("about").textContent).toContain("an entry ID");
    expect(document.querySelector("[data-target='act']")).not.toBeNull();
  });

  test("the thread list offers only threads the act may act on", async () => {
    const jam: ActDeclaration = { label: "Start a jam", targets: { none: ["open"] }, who: { roles: ["member"] }, hold: { scope: "body.scope", workspace: true } };
    const { room, adapter } = await open({ acts: { ...SETLIST_ACTS, "start-jam": jam } });
    await room.act("start-song", null, { title: "Blue Bossa", key: "c", tempo: 132, scope: ["songs/blue-bossa/**"] }, { binding: await bindingOf(room, "start-song") });
    await room.act("start-jam", null, { scope: ["jams/monday/**"] }, { binding: await bindingOf(room, "start-jam") });
    await waitFor(() => expect(adapter.snapshot()!.lanes).toHaveLength(2));
    renderAt("#/acts", adapter);
    await prepare("Add a part");
    expect([...(screen.getByLabelText(/^Thread/) as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Choose a thread", "Start a song: Blue Bossa"]);
  });
});

describe("sending an act", () => {
  test("the declared limits are checked first: a wrong field is named and nothing is sent", async () => {
    const { room, adapter } = await open();
    renderAt("#/acts", adapter);
    await prepare("Start a song");
    input(/^scope/, "songs/footprints/**");
    input(/^tempo/, "300");
    submit();
    await waitFor(() => expect(field("tempo").textContent).toContain("tempo must be 240 or less."));
    expect(field("title").textContent).toContain("title is required.");
    expect(field("key").textContent).toContain("key is required.");
    expect(field("swing").querySelector("[role='alert']")).toBeNull();
    expect(room.sent).toEqual([]);
  });

  test("a target that is missing is named and nothing is sent", async () => {
    const { room, adapter } = await open();
    renderAt("#/acts", adapter);
    await prepare("Wrap up");
    input(/^lease/, "1");
    submit();
    await waitFor(() => expect(document.querySelector("[data-target='lane']")!.textContent).toContain("Choose a thread."));
    expect(room.sent).toEqual([]);
  });

  test("a good act is sent once, with exactly the binding of the declarations the person was looking at, and is then in the feed", async () => {
    const { room, adapter } = await open();
    const binding = await bindingOf(room, "start-song");
    renderAt("#/acts", adapter);
    await prepare("Start a song");
    await fillSong();
    choose(/^swing/, "true");
    submit();
    const done = await waitFor(() => {
      const d = document.querySelector<HTMLElement>("[data-recorded]");
      expect(d).not.toBeNull();
      return d!;
    });
    expect(room.sent).toEqual([{ kind: "start-song", binding, target: null, body: { scope: ["songs/footprints/**"], title: "Footprints", key: "c", tempo: 96, swing: true } }]);
    expect(done.textContent).toContain("Recorded as entry 2");
    await waitFor(() => expect(adapter.snapshot()!.feed.at(-1)!.text).toBe("@noor: Start a song."));
    expect(adapter.snapshot()!.feed.at(-1)!.id).toBe(done.dataset["recorded"]);
  });

  test("a refusal shows the room's rule with the reason and fix as the declaration worded them", async () => {
    const { room, adapter } = await open();
    await room.act("start-song", null, { title: "Footprints", key: "c", tempo: 96, scope: ["songs/footprints/**"] }, { binding: await bindingOf(room, "start-song") });
    renderAt("#/acts", adapter);
    room.me = "@ivo";
    await prepare("Start a song");
    await fillSong("Footprints again");
    submit();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("scope-overlap");
    expect(alert.textContent).toContain("@noor is already working on those files.");
    expect(alert.textContent).toContain("Pick other files, or cue @noor.");
  });

  test("an act the viewer's role may not sign is refused by the room, and the refusal is shown", async () => {
    const { adapter } = await open({ acts: SETLIST_ACTS }, "@keys-bot");
    renderAt("#/acts", adapter);
    await prepare("Sign off");
    choose(/^Thread/, "");
    fireEvent.input(document.querySelector("#act-target-generation")!, { target: { value: "1" } });
    // No thread exists, so give the form a well-formed one by hand: the room judges the role first.
    const lane = document.querySelector<HTMLSelectElement>("#act-target-lane")!;
    const opt = document.createElement("option");
    opt.value = "act_2_0a1b2c3d";
    lane.append(opt);
    fireEvent.change(lane, { target: { value: "act_2_0a1b2c3d" } });
    input(/^head/, "a".repeat(40));
    choose(/^verdict/, "approve");
    input(/^scope/, "songs/**");
    submit();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("role-forbids");
    expect(alert.textContent).toContain("The role agent may not sign sign-off.");
  });
});

describe("a meaning that changed behind the form (binding-stale)", () => {
  test("nothing is resubmitted until the person confirms; the form says what changed; a new required field stops the resend", async () => {
    const { room, adapter } = await open();
    const song = await room.act("start-song", null, { title: "Blue Bossa", key: "c", tempo: 132, scope: ["songs/blue-bossa/**"] }, { binding: await bindingOf(room, "start-song") });
    await waitFor(() => expect(adapter.snapshot()!.lanes).toHaveLength(1));
    const oldBinding = await bindingOf(room, "add-part");
    room.sent.length = 0; // the setup's own act is not the form's
    renderAt("#/acts", adapter);
    await prepare("Add a part");
    // The policy changes after the form is open: add-part now needs a feel.
    await room.activate({ acts: SETLIST_ACTS_2 });
    const newBinding = await bindingOf(room, "add-part");
    expect(newBinding).not.toBe(oldBinding);
    const activePolicy = (await room.acts()).policy;
    await waitFor(() => expect(adapter.snapshot()!.catalogue!.policy).toBe(activePolicy));
    // The snapshot has refreshed, and the open form still shows the meaning the person chose.
    expect(field("feel")).toBeNull();
    choose(/^Thread/, "id" in song ? song.id : "");
    input(/^lease/, "1");
    input(/^expectedGeneration/, "0");
    input(/^head/, "a".repeat(40));
    choose(/^instrument/, "bass");
    input(/^section/, "head");
    input(/^bars/, "16");
    submit();
    const stale = await waitFor(() => {
      const d = document.querySelector<HTMLElement>("[data-stale='add-part']");
      expect(d).not.toBeNull();
      return d!;
    });
    expect(stale.textContent).toContain("“Add a part” means something different now");
    expect(stale.textContent).toContain("Nothing was recorded.");
    expect(within(stale).getByText("New field: feel (one of straight, swung, latin, required).")).toBeTruthy();
    // The one stale act was sent, with the old binding. Nothing else, however long we wait.
    expect(room.sent.map((s) => s.binding)).toEqual([oldBinding]);
    await settled();
    expect(room.sent).toHaveLength(1);
    expect(document.querySelector("button[type='submit']")).toBeNull();
    // Confirming shows the new meaning's form; its new required field is missing, so nothing is sent yet.
    fireEvent.click(screen.getByRole("button", { name: "Send it with the new meaning" }));
    await waitFor(() => expect(field("feel").textContent).toContain("feel is required."));
    expect(room.sent).toHaveLength(1);
    choose(/^feel/, "latin");
    submit();
    await waitFor(() => expect(document.querySelector("[data-recorded]")).not.toBeNull());
    expect(room.sent.map((s) => s.binding)).toEqual([oldBinding, newBinding]);
    expect(room.sent[1]!.body).toMatchObject({ feel: "latin", bars: 16 });
  });

  test("confirming sends once more, with the new binding, when the form still fits the new meaning", async () => {
    const { room, adapter } = await open();
    const old = await bindingOf(room, "start-song");
    renderAt("#/acts", adapter);
    await prepare("Start a song");
    await fillSong();
    await room.activate({ acts: { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, body: { ...SETLIST_ACTS["start-song"]!.body, tempo: { type: "int", min: 40, max: 300 } } } } });
    submit();
    const stale = await waitFor(() => {
      const d = document.querySelector<HTMLElement>("[data-stale='start-song']");
      expect(d).not.toBeNull();
      return d!;
    });
    expect(stale.textContent).toContain("Changed field: tempo (a whole number from 40 to 300, required); it was tempo (a whole number from 40 to 240, required).");
    expect(room.sent).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Send it with the new meaning" }));
    await waitFor(() => expect(document.querySelector("[data-recorded]")).not.toBeNull());
    expect(room.sent.map((s) => s.binding)).toEqual([old, await bindingOf(room, "start-song")]);
    expect(room.sent[1]!.body).toEqual(room.sent[0]!.body);
  });

  test("the person can decline: nothing more is sent and the list returns", async () => {
    const { room, adapter } = await open();
    renderAt("#/acts", adapter);
    await prepare("Start a song");
    await fillSong();
    await room.activate({ acts: { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, hold: { scope: "body.scope", workspace: true, leaseSeconds: 60 } } } });
    submit();
    await waitFor(() => expect(document.querySelector("[data-stale]")).not.toBeNull());
    expect(document.querySelector("[data-stale]")!.textContent).toContain("What it holds when it opens a thread changed");
    fireEvent.click(screen.getByRole("button", { name: "Do not send" }));
    await waitFor(() => expect(document.querySelector("[data-acts='declared']")).not.toBeNull());
    expect(room.sent).toHaveLength(1);
    expect(adapter.snapshot()!.feed.filter((f) => f.type === "act")).toEqual([]);
  });

  test("the kind is gone (kind-undeclared): the form says so, reads the acts again and sends nothing more", async () => {
    const { room, adapter } = await open();
    const song = await room.act("start-song", null, { title: "Blue Bossa", key: "c", tempo: 132, scope: ["songs/blue-bossa/**"] }, { binding: await bindingOf(room, "start-song") });
    await waitFor(() => expect(adapter.snapshot()!.lanes).toHaveLength(1));
    room.sent.length = 0; // the setup's own act is not the form's
    renderAt("#/acts", adapter);
    await prepare("Wrap up");
    await room.activate({ acts: SETLIST_ACTS_2 });
    choose(/^Thread/, "id" in song ? song.id : "");
    input(/^lease/, "1");
    submit();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This room no longer has the act “Wrap up”");
    expect(alert.textContent).toContain("Nothing was recorded.");
    expect(room.sent).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "See the room's acts" }));
    await waitFor(() => expect([...document.querySelectorAll<HTMLElement>("li[data-act]")].map((a) => a.dataset["act"])).toEqual(["start-song", "add-part", "cue", "sign-off"]));
    expect(screen.getByText("Signal the band")).toBeTruthy();
  });
});

// A room, its adapter and a filled-in form, for the cases below.
type Acts = Readonly<Record<string, ActDeclaration>>;

/** The setlist's acts, with one more text field on `start-song`. */
const withField = (name: string, optional: boolean): Acts => ({
  ...SETLIST_ACTS,
  "start-song": { ...SETLIST_ACTS["start-song"]!, body: { ...SETLIST_ACTS["start-song"]!.body, [name]: { type: "text", max: 80, ...(optional ? { optional: true } : {}) } } },
});

const song = { scope: "songs/local/**", title: "Local", key: "c", tempo: "120" };
const sent = { scope: ["songs/local/**"], title: "Local", key: "c", tempo: 120 };
const actsIn = (a: LiveRoom) => a.snapshot()!.feed.filter((e) => e.type === "act");

/** A room, its adapter, and the `start-song` form filled in. `paused` holds back the room's change notices. */
async function opened(declared: Acts = SETLIST_ACTS, paused = false) {
  const room = await MemoryRoom.found("the-band/setlist", BAND, { acts: declared });
  room.me = "@noor";
  if (paused) {
    const watch = room.watch.bind(room);
    room.watch = (cursor, _onUpdate) => watch(cursor, () => {});
  }
  const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor", () => new Date("2026-10-03T10:00:00Z"));
  opened.adapters.push(adapter);
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
opened.adapters = [] as LiveRoom[];
afterEach(() => {
  for (const a of opened.adapters.splice(0)) a.stop();
});

describe("a field named like an inherited property, in the form (R-DECL-12)", () => {
  test("a required field named toString, left empty, shows its own problem and sends nothing; once filled in, it is sent under its own name (review fb27de86, finding 1)", async () => {
    const name = "toString";
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

describe("an answer that was lost is not a rejection (R-IDEM-2; review fb27de86, finding 2)", () => {
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

  test("an act the room recorded, whose answer was lost, is shown as unresolved, never as not taken; the page reads the room again, though the room sends it no notice", async () => {
    const { room, adapter } = await opened(SETLIST_ACTS, true);
    loseAnswers(room, 1, true);
    fireEvent.submit(form());
    const alert = await screen.findByRole("alert");
    expect(unresolved()).toBe(alert);
    expect(alert.textContent).toContain("The room's answer did not arrive");
    expect(alert.textContent).toContain("may have been recorded, or it may not: The room's reply did not arrive.");
    expect(alert.textContent).not.toContain(NOT_TAKEN);
    expect(document.querySelector("[data-recorded]")).toBeNull();
    // The room did record it, and the page's own feed shows it.
    await waitFor(() => expect(actsIn(adapter)).toHaveLength(1));
    // The notice names the key the act was sent with, which is one of the room's form.
    expect(alert.querySelector("code")!.textContent).toBe(room.keys[0]);
    expect(room.keys[0]).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
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
    await waitFor(() => expect(actsIn(adapter)).toHaveLength(1));
    expect(document.querySelector<HTMLElement>("[data-recorded]")!.dataset["recorded"]).toBe((actsIn(adapter)[0] as { id: string }).id);
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
    await waitFor(() => expect(actsIn(adapter)).toHaveLength(1));
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

describe("the demo room, acted on end to end", () => {
  test("a person prepares and sends an act of an application that is not code review, and sees it recorded", async () => {
    const { adapter, room } = await declaredDemo("@ivo");
    renderAt("#/acts", adapter);
    expect([...document.querySelectorAll<HTMLElement>("li[data-act]")].map((a) => a.dataset["act"])).toEqual(["start-song", "add-part", "cue", "sign-off"]);
    await prepare("Signal the band");
    const before = room.sent.length;
    const target = adapter.snapshot()!.feed.at(-1)!.id;
    fireEvent.input(document.querySelector("#act-target-act")!, { target: { value: target } });
    choose(/^signal/, "count-in");
    choose(/^to/, "@noor");
    submit();
    await waitFor(() => expect(document.querySelector("[data-recorded]")).not.toBeNull());
    expect(room.sent.slice(before)).toEqual([{ kind: "cue", binding: await bindingOf(room, "cue"), target: { act: target }, body: { signal: "count-in", to: "@noor" } }]);
    location.hash = "#/room";
    await screen.findByText("@ivo: Signal the band.");
    const shown = document.querySelector<HTMLElement>("[data-record='cue']")!;
    expect(within(shown).getByText("signal").nextElementSibling!.textContent).toBe("count-in");
  });
});
