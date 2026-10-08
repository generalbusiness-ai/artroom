import { expect, test, vi } from "vitest";
import { b64url, newIncarnation } from "@generalbusiness/artroom-bytes";

// Actual Settings handlers over a minimal DOM/localStorage stand-in. No
// browser, CSP enforcement, membership judgment or external service runs.
test("Settings refuses an unsupported service origin without changing saved state or making requests; own-origin settings still save", async () => {
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
    replaceChildren(...children: (Element | string)[]) { this.children = children; }
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
  const location = { origin: "https://page.test", hash: "#/settings" };
  const membership = { kind: "membership", scope: `sc_${"b".repeat(51)}a`, inc: newIncarnation(new Uint8Array(16).fill(2)) };
  const legacy = JSON.stringify({ service: "https://another.test", place: { directory: `sc_${"a".repeat(52)}`, membership }, secret: b64url(new Uint8Array(32).fill(7)) });
  let saved = legacy;
  let redraw!: () => void;
  const fetch = vi.fn(() => { throw new Error("Settings must not make a request"); });
  vi.stubGlobal("document", { createElement: (tag: string) => new Element(tag), getElementById: () => root });
  vi.stubGlobal("location", location);
  vi.stubGlobal("localStorage", { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } });
  vi.stubGlobal("window", { addEventListener: (_name: string, handler: () => void) => { redraw = handler; } });
  vi.stubGlobal("fetch", fetch);
  try {
    await import("../src/main.ts");
    const form = root.find((element) => element.tag === "form")!;
    const service = root.find((element) => element.attrs["name"] === "service")!;
    form.fire("submit");
    form.querySelector("#join")!.fire("click");
    form.querySelector("#new-key")!.fire("click");
    expect([saved, fetch.mock.calls.length]).toEqual([legacy, 0]);
    expect(root.textContent).toContain("Unsupported service origin");
    service.value = "";
    form.fire("submit");
    expect(JSON.parse(saved)).toEqual({ ...JSON.parse(legacy), service: location.origin });
    expect(location.hash).toBe("#/");
    // Legacy saved settings must also stop before a view can send any I/O.
    saved = legacy;
    redraw();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.textContent).toContain("Unsupported service origin");
    expect(fetch).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
