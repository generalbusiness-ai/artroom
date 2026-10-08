import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { initializeCapture } from "../../../scripts/demo/capture-binding.ts";

// The initialization function is the exact function serialized by Playwright.
// Window/location/storage are scripted stand-ins: this checks document-time
// custody without a browser, key, provider, or claim about rendered screens.
test("only the configured page's top-level document receives capture settings", () => {
  const kept = { service: "https://scopes.test/service", place: { directory: "test directory", membership: {} }, secret: "TEST ONLY" };
  const writes = (url: string, frame = false) => {
    const calls: unknown[][] = [];
    const document = new URL(url);
    const window: { top?: unknown } = {};
    window.top = frame ? {} : window;
    runInNewContext(`(${initializeCapture.toString()})(kept)`, { kept, window, URL, location: document, localStorage: { setItem: (...args: unknown[]) => calls.push(args) } });
    return calls;
  };
  expect(writes("https://scopes.test/service/page/#/rules")).toEqual([["artroom-page", JSON.stringify(kept)]]);
  // The initial URL can be correct while the actual redirected/new document
  // is elsewhere. No key-bearing write is made in that document or a frame.
  expect(writes("https://other.test/service/page/")).toEqual([]);
  expect(writes("https://scopes.test/other/page/")).toEqual([]);
  expect(writes("https://scopes.test/service/page/", true)).toEqual([]);
  expect(writes("https://scopes.test/service/site/room/HEAD/page.md")).toEqual([]);
});
