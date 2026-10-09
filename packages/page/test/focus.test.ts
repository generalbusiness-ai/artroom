import { afterEach, expect, test, vi } from "vitest";
import { controlKey, keepFocus, restoreFocus } from "../src/focus.ts";

// DOM/focus stand-in: this witnesses keyed replacement, not a browser or AT.
class Control {
  readonly tagName = "TEXTAREA";
  value = "Unsent words";
  selectionStart = 2; selectionEnd = 8; selectionDirection = "backward" as const;
  focused = false;
  constructor(readonly key: string) {}
  getAttribute(name: string) { return name === "data-focus-key" ? this.key : null; }
  hasAttribute() { return false; }
  setSelectionRange(start: number, end: number) { this.selectionStart = start; this.selectionEnd = end; }
  focus() { this.focused = true; }
}
const container = (controls: Control[]) => ({ contains: (control: Control) => controls.includes(control), querySelectorAll: () => controls }) as unknown as HTMLElement;
afterEach(() => vi.unstubAllGlobals());

test("same keyed refresh preserves the unsent value, selection and focus on the replacement control", () => {
  const key = controlKey("origin/room/member/scope/version-7", "field:body");
  const original = new Control(key);
  vi.stubGlobal("document", { activeElement: original });
  const saved = keepFocus(container([original]));
  const replacement = new Control(key); replacement.value = "Earlier render value";
  expect(restoreFocus(container([replacement]), saved)).toBe(true);
  expect([replacement.value, replacement.selectionStart, replacement.selectionEnd, replacement.focused]).toEqual(["Unsent words", 2, 8, true]);
});

test("a new room or selected version cannot inherit another subject's focus or draft", () => {
  const original = new Control(controlKey("origin/room-A/member/scope/version-7", "field:__proto__"));
  vi.stubGlobal("document", { activeElement: original });
  const saved = keepFocus(container([original]));
  const changedRoom = new Control(controlKey("origin/room-B/member/scope/version-7", "field:__proto__"));
  const changedVersion = new Control(controlKey("origin/room-A/member/scope/version-8", "field:__proto__"));
  changedRoom.value = "Room B draft"; changedVersion.value = "Version 8 draft";
  expect(restoreFocus(container([changedRoom, changedVersion]), saved)).toBe(false);
  expect([changedRoom.value, changedVersion.value, changedRoom.focused, changedVersion.focused]).toEqual(["Room B draft", "Version 8 draft", false, false]);
});
