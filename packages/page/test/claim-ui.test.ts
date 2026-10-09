import { expect, test, vi } from "vitest";

// Real shell/modal handlers with scripted adapter/data and DOM boundaries.
// Native founding/recovery is witnessed separately against real scopes.
test("only an eligible configured founder sees creation; an in-flight or stale claim cannot replace another room", async () => {
  const gate = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };
  let rendered = gate();
  class Element {
    children: (Element | string)[] = []; attrs: Record<string, string> = {}; value = ""; text = "";
    handlers = new Map<string, (event: { preventDefault(): void }) => void>();
    constructor(readonly tag: string) {}
    setAttribute(key: string, value: string) { this.attrs[key] = value; if (key === "value") this.value = value; }
    removeAttribute(key: string) { delete this.attrs[key]; }
    append(...children: (Element | string)[]) { this.children.push(...children); }
    replaceChildren(...children: (Element | string)[]) { this.children = children; rendered.resolve(); }
    addEventListener(key: string, callback: (event: { preventDefault(): void }) => void) { this.handlers.set(key, callback); }
    fire(key: string) { this.handlers.get(key)?.({ preventDefault() {} }); }
    focus() {} showModal() {} close() {} remove() {}
    set textContent(value: string) { this.text = value; }
    get textContent(): string { return this.text || this.children.map((child) => typeof child === "string" ? child : child.textContent).join(" "); }
    find(predicate: (element: Element) => boolean): Element | undefined { if (predicate(this)) return this; for (const child of this.children) if (child instanceof Element) { const found = child.find(predicate); if (found) return found; } return undefined; }
  }
  const root = new Element("div");
  const register = { kind: "register", scope: "register", inc: "one" };
  let settings = { place: { directory: "room", membership: { kind: "membership", scope: "membership", inc: "one" } }, secret: "device", register };
  let eligible = true, locked = true;
  let redraw!: () => void;
  let finish!: (value: unknown) => void;
  let attempted = gate();
  const claim = vi.fn(() => { attempted.resolve(); return new Promise((resolve) => { finish = resolve; }); });
  vi.doMock("@generalbusiness/artroom-bytes", async () => ({ ...await vi.importActual<typeof import("@generalbusiness/artroom-bytes")>("@generalbusiness/artroom-bytes"), b64url: () => "device", unb64url: () => new Uint8Array(32), isScopeRef: (value: unknown) => !!value && typeof value === "object" && "kind" in value, keyIdOfSecret: () => "key" }));
  vi.doMock("../src/claim.ts", () => ({ allowedClaim: async () => { if (!eligible) throw new Error("Not founder"); return { register, definition: "platform:register@2" }; }, claimRoom: claim }));
  vi.doMock("../src/data.ts", () => ({
    openRoom: async () => ({ session: { service: "https://page.test", secret: new Uint8Array(32) }, ...settings.place, rules: "rules", name: "Recorded repository", me: { handle: "@founder" } }),
    actsOn: async () => ({ acts: [], hidden: 0 }), listLanes: async () => ({ issues: [], changes: [] }), siteAddress: () => "/site/", actAssociation: () => "association", act: vi.fn(), fieldValue: vi.fn(), joinRoom: vi.fn(), loadChange: vi.fn(), loadIssue: vi.fn(), loadRules: vi.fn(), placeOf: vi.fn(),
  }));
  vi.doMock("../src/view.ts", () => ({ h: (tag: string, attrs: Record<string, string> = {}, ...children: unknown[]) => { const element = new Element(tag); for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value); element.children = children.flat().filter((child) => child !== null && child !== undefined && child !== false) as (Element | string)[]; return element; }, roomScreen: () => new Element("main"), actsPanel: () => new Element("section"), failureScreen: () => new Element("main"), changeScreen: vi.fn(), issueScreen: vi.fn(), rulesScreen: vi.fn(), answerLine: vi.fn(), nonacceptedAnswerText: vi.fn() }));
  vi.stubGlobal("document", { getElementById: () => root }); vi.stubGlobal("HTMLDialogElement", Element);
  vi.stubGlobal("location", { origin: "https://page.test", hash: "#/" });
  const save = vi.fn((_key: string, value: string) => { settings = JSON.parse(value) as typeof settings; });
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(settings), setItem: save });
  vi.stubGlobal("navigator", { get locks() { return locked ? {} : undefined; } });
  vi.stubGlobal("window", { addEventListener: (_key: string, callback: () => void) => { redraw = callback; } });
  try {
    await import("../src/main.ts"); await rendered.promise;
    root.find((element) => element.tag === "button" && element.textContent === "Create room")!.fire("click");
    const dialog = root.find((element) => element.tag === "dialog")!;
    const input = dialog.find((element) => element.tag === "input")!; input.value = "Local intent";
    const form = dialog.find((element) => element.tag === "form")!;
    form.fire("submit"); await attempted.promise; form.fire("submit"); expect(claim).toHaveBeenCalledTimes(1);
    finish({ repository: null, pending: true, outcome: { code: 1, lines: ["The original request remains pending"] } });
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    expect(input.attrs["disabled"]).toBe("");
    expect(dialog.textContent).toContain("Resume creation");
    attempted = gate(); form.fire("submit"); await attempted.promise;
    expect(claim).toHaveBeenCalledTimes(2);
    expect(claim.mock.calls[1]).toEqual(claim.mock.calls[0]); // Same adapter/binding/label, no --again or new key.
    settings = { ...settings, place: { ...settings.place, directory: "another-room" } };
    finish({ repository: { directory: { scope: "new-room" }, membership: settings.place.membership }, pending: false, outcome: { code: 0, lines: [] } });
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    expect(save).not.toHaveBeenCalled();
    eligible = false; rendered = gate(); redraw(); await rendered.promise;
    expect(root.find((element) => element.tag === "button" && element.textContent === "Create room")).toBeUndefined();
    eligible = true; locked = false; rendered = gate(); redraw(); await rendered.promise;
    expect(root.find((element) => element.tag === "button" && element.textContent === "Create room")).toBeUndefined();
  } finally { vi.unstubAllGlobals(); for (const path of ["../src/claim.ts", "../src/data.ts", "../src/view.ts", "@generalbusiness/artroom-bytes"]) vi.doUnmock(path); }
});
