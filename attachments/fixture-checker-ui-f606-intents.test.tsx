/** Local-only unresolved-intent controls at exact f606dd89; no authenticated service. */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import type { ActsCatalogue, DeclaredRecord, HttpRoom } from "../src/room/contract.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { MemoryRoom } from "../src/room/mock/memory-room.ts";
import { BAND } from "../src/room/mock/declared-room.ts";
import { SETLIST_ACTS } from "../src/room/mock/setlist.ts";
import { renderAt } from "./helpers.tsx";
const adapters: LiveRoom[] = [];
afterEach(() => { cleanup(); for (const a of adapters.splice(0)) a.stop(); location.hash = ""; });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}
async function opened() {
  const room = await MemoryRoom.found("checker/f606-intents", BAND, { acts: SETLIST_ACTS });
  room.me = "@noor";
  const watch = room.watch.bind(room);
  room.watch = (cursor, _onUpdate) => watch(cursor, () => {});
  const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor");
  adapters.push(adapter);
  await adapter.start();
  renderAt("#/acts", adapter);
  fireEvent.click(screen.getByRole("button", { name: "Prepare “Start a song”" }));
  await waitFor(() => expect(form()).not.toBeNull());
  fireEvent.input(screen.getByLabelText(/^scope/), { target: { value: "songs/intents/**" } });
  fireEvent.input(screen.getByLabelText(/^title/), { target: { value: "Original" } });
  fireEvent.change(screen.getByLabelText(/^key/), { target: { value: "c" } });
  fireEvent.input(screen.getByLabelText(/^tempo/), { target: { value: "120" } });
  return { room, adapter };
}
const form = () => document.querySelector<HTMLFormElement>("form[data-act-form]")!;
const lost = () => ({ name: "ArtroomError", code: "timeout", retryable: true, maybeRecorded: true, message: "The answer was lost." });
const changed = { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, label: "Begin a tune", body: { ...SETLIST_ACTS["start-song"]!.body, feel: { type: "text" as const, max: 20, optional: true as const } } } };
describe("checker f606 captured unknown intent", () => {
  test.each([false, true])("an accepted lost answer, activation=%s: pending retry keeps original intent, key and record while keyboard sends nothing", async (activation) => {
    const { room, adapter } = await opened();
    const act = room.act.bind(room);
    const release = deferred();
    let calls = 0;
    let original: DeclaredRecord | undefined;
    room.act = async (...args) => {
      calls += 1;
      if (calls === 1) {
        const answer = await act(...args);
        expect("refused" in answer).toBe(false);
        original = answer as DeclaredRecord;
        throw lost();
      }
      await release.promise;
      return act(...args);
    };
    fireEvent.submit(form());
    await screen.findByRole("alert");
    expect(document.querySelector("[data-unresolved]")).not.toBeNull();
    const before = { ...room.sent[0]! };
    const key = room.keys[0];
    if (activation) {
      await room.activate({ acts: changed });
      await adapter.readCatalogue();
    }
    fireEvent.input(screen.getByLabelText(/^title/), { target: { value: "Edited later" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask again, the same act" }));
    await waitFor(() => expect(calls).toBe(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sending…" })).toHaveProperty("disabled", true));
    expect(screen.queryByRole("button", { name: "Ask again, the same act" })).toBeNull();
    fireEvent.submit(form());
    await Promise.resolve();
    expect(calls).toBe(2);
    release.resolve();
    await waitFor(() => expect(document.querySelector("[data-recorded]")?.getAttribute("data-recorded")).toBe(original!.id));
    expect(room.sent).toEqual([before, before]);
    expect(room.keys).toEqual([key, key]);
    expect(room.sent[1]!.binding).toBe(before.binding);
    await waitFor(() => expect(adapter.snapshot()!.feed.filter((e) => e.type === "act")).toHaveLength(1));
    expect(document.querySelector("[data-recorded]")!.textContent).toContain(`entry ${original!.seq}`);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  test("an unrecorded lost answer followed by changed meaning needs deliberate confirmation and a new key", async () => {
    const { room, adapter } = await opened();
    const act = room.act.bind(room);
    const captured: Parameters<typeof room.act>[] = [];
    room.act = async (...args) => {
      captured.push(args);
      if (captured.length === 1) throw lost();
      return act(...args);
    };
    fireEvent.submit(form());
    await screen.findByRole("alert");
    const oldBinding = captured[0]![3].binding;
    const oldKey = captured[0]![3].idempotencyKey;
    await room.activate({ acts: changed });
    const fresh = (await adapter.readCatalogue()) as ActsCatalogue;
    expect(fresh.acts["start-song"]!.binding).not.toBe(oldBinding);
    fireEvent.click(screen.getByRole("button", { name: "Ask again, the same act" }));
    await waitFor(() => expect(document.querySelector("[data-stale]")).not.toBeNull());
    expect(captured).toHaveLength(2);
    expect(captured[1]).toEqual(captured[0]);
    expect(room.sent).toHaveLength(1); // Only the unchanged retry reached the stand-in admission.
    expect(document.querySelector("[data-recorded]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send it with the new meaning" }));
    await waitFor(() => expect(document.querySelector("[data-recorded]")).not.toBeNull());
    expect(captured).toHaveLength(3);
    expect(captured[2]![3].binding).toBe(fresh.acts["start-song"]!.binding);
    expect(captured[2]![3].idempotencyKey).not.toBe(oldKey);
    expect(captured[2]![2]).toEqual(captured[0]![2]);
    expect(adapter.snapshot()!.catalogue!.policy).toBe(fresh.policy);
  });
});

