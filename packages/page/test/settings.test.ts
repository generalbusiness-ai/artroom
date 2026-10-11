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
    getAttribute(name: string) { return this.attrs[name] ?? null; }
    hasAttribute(name: string) { return Object.hasOwn(this.attrs, name); }
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
    querySelectorAll(selector: string): Element[] {
      const matches = (element: Element) => {
        if (selector.startsWith("#")) return element.attrs["id"] === selector.slice(1);
        const attribute = /^([a-z][a-z0-9-]*)?\[([a-z0-9-]+)\]$/.exec(selector);
        if (attribute) return (!attribute[1] || element.tag === attribute[1]) && element.hasAttribute(attribute[2]!);
        return element.tag === selector;
      };
      const descendants = this.children.flatMap(child => child instanceof Element ? [child, ...child.querySelectorAll("*")] : []);
      return selector === "*" ? descendants : descendants.filter(matches);
    }
    querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
    fire(name: string) { this.handlers.get(name)!({ preventDefault() {} }); }
  }
  const root = new Element("div");
  const location = { origin: "https://page.test", hash: "#/" };
  const membership = { kind: "membership", scope: `sc_${"b".repeat(51)}a`, inc: newIncarnation(new Uint8Array(16).fill(2)) };
  const legacy = JSON.stringify({ service: "https://another.test", place: { directory: `sc_${"a".repeat(52)}`, membership }, secret: b64url(new Uint8Array(32).fill(7)) });
  let saved = legacy;
  let storageFailure: "none" | "throw" | "drop" | "readback" = "none";
  let failReadback = false;
  let redraw!: () => void;
  let requested!: () => void;
  const firstRequest = new Promise<void>((resolve) => { requested = resolve; });
  const fetch = vi.fn((_address: string) => { requested(); throw new Error("Scripted unavailable service"); });
  vi.stubGlobal("document", { createElement: (tag: string) => new Element(tag), getElementById: () => root });
  vi.stubGlobal("location", location);
  vi.stubGlobal("localStorage", { getItem: () => { if (failReadback) { failReadback = false; throw new Error("Readback unavailable"); } return saved; }, setItem: (_key: string, value: string) => { if (storageFailure === "throw") throw new Error("Storage full"); if (storageFailure !== "drop") saved = value; if (storageFailure === "readback") failReadback = true; } });
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
    // Failed persistence cannot navigate or replace the selected device key.
    // Exercise both explicit failure and a storage adapter that drops writes.
    const previous = saved;
    const replacement = b64url(new Uint8Array(32).fill(8));
    const roomText = root.find((element) => element.attrs["name"] === "room")!;
    roomText.value = "an unfinished invitation";
    roomText.fire("input");
    root.find((element) => element.attrs["name"] === "secret")!.value = replacement;
    roomText.value = ""; // Keep the existing room while attempting the key change.
    storageFailure = "throw";
    root.find((element) => element.tag === "form")!.fire("submit");
    expect(saved).toBe(previous);
    expect(location.hash).toBe("#/settings");
    expect(root.textContent).toContain("settings could not be verified");
    storageFailure = "drop";
    root.find((element) => element.attrs["id"] === "new-key")!.fire("click");
    expect(saved).toBe(previous);
    expect(location.hash).toBe("#/settings");
    expect(root.textContent).toContain("new key could not be verified");
    redraw();
    expect(root.find((element) => element.attrs["name"] === "room")!.textContent).toContain("an unfinished invitation");
    expect(JSON.parse(saved)).toEqual({ place, secret });
    expect(fetch).not.toHaveBeenCalled();
    // A write can succeed even when its verification read fails. The message
    // cannot promise that the old key is still selected in that case.
    root.find((element) => element.attrs["name"] === "room")!.value = "";
    root.find((element) => element.attrs["name"] === "secret")!.value = replacement;
    storageFailure = "readback";
    root.find((element) => element.tag === "form")!.fire("submit");
    expect(JSON.parse(saved)).toEqual({ place, secret: replacement });
    expect(location.hash).toBe("#/settings");
    expect(root.textContent).toContain("Check the saved room and key before another action");
    expect(root.textContent).not.toContain("previous room and key remain selected");
    storageFailure = "none";
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
