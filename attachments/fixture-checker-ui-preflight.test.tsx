/** Independent, local-only controls for exact UI head 5dc0d044. */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import { codeReviewPolicy, defaultPolicy, validatePolicyV2 } from "@generalbusiness/artroom-policy";
import { fieldsOf, readBody } from "../src/room/acts.ts";
import type { ActDeclaration, HttpRoom } from "../src/room/contract.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { BAND } from "../src/room/mock/declared-room.ts";
import { MemoryRoom } from "../src/room/mock/memory-room.ts";
import { SETLIST_ACTS } from "../src/room/mock/setlist.ts";
import { renderAt } from "./helpers.tsx";

const adapters: LiveRoom[] = [];
afterEach(() => {
  cleanup();
  for (const adapter of adapters.splice(0)) adapter.stop();
  location.hash = "";
});

function fieldsWith(name: string, optional: boolean) {
  const declaration: ActDeclaration = {
    ...SETLIST_ACTS["start-song"]!,
    body: { ...SETLIST_ACTS["start-song"]!.body, [name]: { type: "text", max: 80, ...(optional ? { optional: true } : {}) } },
  };
  const acts = { ...SETLIST_ACTS, "start-song": declaration };
  const validated = validatePolicyV2({ ...codeReviewPolicy(defaultPolicy()), acts });
  expect(validated.ok ? [] : validated.problems).toEqual([]);
  return fieldsOf(declaration, "none")!;
}

const song = { scope: "songs/local/**", title: "Local", key: "c", tempo: "120" };

describe("checker field baseline", () => {
  test("ordinary optional omission produces a valid body", () => {
    expect(readBody(fieldsWith("caption", true), song)).toEqual({ ok: true, body: { scope: ["songs/local/**"], title: "Local", key: "c", tempo: 120 } });
  });
  test.each(["toString", "valueOf"])("own %s input is read as an ordinary declared field", (name) => {
    const read = readBody(fieldsWith(name, true), { ...song, [name]: "own value" });
    expect(read).toEqual({ ok: true, body: { scope: ["songs/local/**"], title: "Local", key: "c", tempo: 120, [name]: "own value" } });
  });
});

describe("checker inherited-field regression", () => {
  test.each(["toString", "valueOf"])("omitted optional legal %s field does not read the Object prototype", (name) => {
    const fields = fieldsWith(name, true);
    expect(() => readBody(fields, song)).not.toThrow();
    expect(readBody(fields, song)).toEqual({ ok: true, body: { scope: ["songs/local/**"], title: "Local", key: "c", tempo: 120 } });
  });
  test.each(["toString", "valueOf"])("missing required legal %s field names a validation problem", (name) => {
    const fields = fieldsWith(name, false);
    expect(() => readBody(fields, song)).not.toThrow();
    expect(readBody(fields, song)).toEqual({ ok: false, problems: { [name]: `${name} is required.` } });
  });
});

async function opened(acts: Readonly<Record<string, ActDeclaration>> = SETLIST_ACTS) {
  const room = await MemoryRoom.found("checker/local-ui", BAND, { acts });
  const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor", () => new Date("2026-10-03T10:00:00Z"));
  adapters.push(adapter);
  await adapter.start();
  renderAt("#/acts", adapter);
  fireEvent.click(screen.getByRole("button", { name: "Prepare “Start a song”" }));
  await waitFor(() => expect(document.querySelector("form[data-act-form]")).not.toBeNull());
  fireEvent.input(screen.getByLabelText(/^scope/), { target: { value: "songs/local/**" } });
  fireEvent.input(screen.getByLabelText(/^title/), { target: { value: "Local" } });
  fireEvent.change(screen.getByLabelText(/^key/), { target: { value: "c" } });
  fireEvent.input(screen.getByLabelText(/^tempo/), { target: { value: "120" } });
  return { room, adapter };
}

describe("checker outcome baseline", () => {
  test("a confirmed answer is shown as recorded", async () => {
    const { room, adapter } = await opened();
    fireEvent.submit(document.querySelector("form[data-act-form]")!);
    await waitFor(() => expect(document.querySelector("[data-recorded]")).not.toBeNull());
    expect(room.sent).toHaveLength(1);
    await waitFor(() => expect(adapter.snapshot()!.feed.filter((entry) => entry.type === "act")).toHaveLength(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

function withOptional(name: string) {
  return { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, body: { ...SETLIST_ACTS["start-song"]!.body, [name]: { type: "text", max: 80, optional: true } } } } as const;
}

describe("checker form baseline", () => {
  test("an ordinary optional text control starts blank without an alert", async () => {
    await opened(withOptional("caption"));
    expect((screen.getByLabelText(/^caption/) as HTMLTextAreaElement).value).toBe("");
    expect(document.querySelector("[data-field='caption'] [role='alert']")).toBeNull();
  });
});

describe("checker inherited-form regression", () => {
  test.each(["toString", "valueOf"])("an optional legal %s control starts blank without inherited state", async (name) => {
    fieldsWith(name, true); // The exact declaration is accepted by the policy validator.
    await opened(withOptional(name));
    expect((screen.getByLabelText(new RegExp(`^${name}`)) as HTMLTextAreaElement).value).toBe("");
    expect(document.querySelector(`[data-field='${name}'] [role='alert']`)).toBeNull();
  });
});

describe("checker uncertain-outcome regression", () => {
  test("a committed act whose reply is lost is not reported as definitely rejected", async () => {
    const { room, adapter } = await opened();
    const accept = room.act.bind(room);
    room.act = async (...args) => {
      const result = await accept(...args);
      expect("refused" in result).toBe(false);
      throw { name: "ArtroomError", code: "timeout", retryable: true, maybeRecorded: true, message: "The reply was lost. Retry with idempotency key checker_lost_reply." };
    };
    fireEvent.submit(document.querySelector("form[data-act-form]")!);
    const alert = await screen.findByRole("alert");
    expect(room.sent).toHaveLength(1);
    await waitFor(() => expect(adapter.snapshot()!.feed.filter((entry) => entry.type === "act")).toHaveLength(1));
    // The local service did accept it; the adapter's only answer is an honest maybeRecorded error.
    expect(alert.textContent).not.toContain("The room did not take the act");
  });
});
