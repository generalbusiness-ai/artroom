import { expect, test, vi } from "vitest";
import { b64url, newIncarnation } from "@generalbusiness/artroom-bytes";

// Actual Settings handlers over a minimal DOM/localStorage stand-in. No
// browser, CSP enforcement, membership judgment or external service runs.
test("Settings ignores a legacy service origin with a message before requests and preserves the room and key without saving an address", async () => {
  let unread!: () => void;
  const unreadView = new Promise<void>((resolve) => { unread = resolve; });
  class Element {
    children: (Element | string)[] = [];
    attrs: Record<string, string> = {};
    handlers = new Map<string, (event: { preventDefault(): void }) => void>();
    value = "";
    className = "";
    constructor(readonly tag: string) {}
    setAttribute(name: string, value: string) { this.attrs[name] = value; if (name === "value") this.value = value; }
    removeAttribute(name: string) { delete this.attrs[name]; }
    append(...children: (Element | string)[]) { this.children.push(...children); }
    replaceChildren(...children: (Element | string)[]) { this.children = children; if (this.textContent.includes("Observation unknown")) unread(); }
    get textContent(): string { return this.children.map((child) => typeof child === "string" ? child : child.textContent).join(" "); }
    set textContent(value: string) { this.children = [value]; }
    addEventListener(name: string, handler: (event: { preventDefault(): void }) => void) { this.handlers.set(name, handler); }
    find(predicate: (element: Element) => boolean): Element | null {
      if (predicate(this)) return this;
      for (const child of this.children) if (child instanceof Element) { const found = child.find(predicate); if (found) return found; }
      return null;
    }
    querySelector(selector: string) { return this.find((element) => element.attrs["id"] === selector.slice(1)); }
    fire(name: string) { this.handlers.get(name)!({ preventDefault() {} }); }
  }
  const root = new Element("div");
  const location = { origin: "https://page.test", hash: "#/" };
  const membership = { kind: "membership", scope: `sc_${"b".repeat(51)}a`, inc: newIncarnation(new Uint8Array(16).fill(2)) };
  const legacy = JSON.stringify({ service: "https://another.test", place: { directory: `sc_${"a".repeat(52)}`, membership }, secret: b64url(new Uint8Array(32).fill(7)) });
  let saved = legacy;
  let redraw!: () => void;
  let requested!: () => void;
  const firstRequest = new Promise<void>((resolve) => { requested = resolve; });
  const fetch = vi.fn((_address: string) => { requested(); throw new Error("Scripted unavailable service"); });
  vi.stubGlobal("document", { createElement: (tag: string) => new Element(tag), getElementById: () => root });
  vi.stubGlobal("location", location);
  vi.stubGlobal("localStorage", { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } });
  vi.stubGlobal("window", { addEventListener: (_name: string, handler: () => void) => { redraw = handler; } });
  vi.stubGlobal("fetch", fetch);
  try {
    await import("../src/main.ts");
    const form = root.find((element) => element.tag === "form")!;
    expect([saved, fetch.mock.calls.length]).toEqual([legacy, 0]);
    expect(root.textContent).toContain("saved connection address is ignored");
    expect(root.textContent).toContain("Your room and key are kept");
    expect(root.find((element) => element.attrs["name"] === "service")).toBeNull();
    const { place, secret } = JSON.parse(legacy) as { place: unknown; secret: string };
    // Saving unchanged settings drops only the obsolete address.
    form.fire("submit");
    expect(JSON.parse(saved)).toEqual({ place, secret });
    expect(location.hash).toBe("#/");
    // New-format settings open normally without requiring the removed field.
    location.hash = "#/settings";
    redraw();
    expect(root.textContent).not.toContain("saved connection address is ignored");
    expect(root.textContent).toContain("This browser keeps key");
    expect(root.find((element) => element.attrs["name"] === "service")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    // The first real session request after migration uses the page's Worker,
    // even if a stale address is injected into the saved data again.
    saved = JSON.stringify({ place, secret, service: "https://another.test" });
    location.hash = "#/settings";
    redraw();
    root.find((element) => element.tag === "form")!.fire("submit");
    redraw();
    await firstRequest;
    expect(fetch.mock.calls[0]?.[0]).toBe(`${location.origin}/v1/scopes/${membership.scope}/sessions`);
    // Finish the scripted unavailable read before restoring the globals.
    await unreadView;
    expect(root.textContent).toContain("Observation unknown");
  } finally { vi.unstubAllGlobals(); }
});
