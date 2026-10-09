import { expect, test, vi } from "vitest";

// Real Settings handlers over scripted DOM/data boundaries; native Join
// encoding/submission is witnessed in join.test.ts and real-scope stories.
test("Join fences duplicate requests and never applies an accepted reply to changed settings", async () => {
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
    focus() {}
    set textContent(value: string) { this.text = value; }
    get textContent(): string { return this.text || this.children.map((child) => typeof child === "string" ? child : child.textContent).join(" "); }
    find(predicate: (element: Element) => boolean): Element | undefined { if (predicate(this)) return this; for (const child of this.children) if (child instanceof Element) { const found = child.find(predicate); if (found) return found; } return undefined; }
    querySelector(selector: string) { return this.find((element) => element.attrs["id"] === selector.slice(1)); }
  }
  const root = new Element("div");
  const original = { place: { directory: "original-room", membership: { kind: "membership", scope: "membership", inc: "one" } }, secret: "device" };
  let settings = original;
  let redraw!: () => void;
  const posts = vi.fn();
  const join = vi.fn(async (_session: unknown, _typed: string, callback: () => void) => { callback(); posts(); throw new Error("Reply lost"); });
  vi.doMock("@generalbusiness/artroom-bytes", async () => ({ ...await vi.importActual<typeof import("@generalbusiness/artroom-bytes")>("@generalbusiness/artroom-bytes"), unb64url: () => new Uint8Array(32), keyIdOfSecret: () => "key", isScopeRef: () => false }));
  vi.doMock("../src/data.ts", () => ({ joinRoom: join, placeOf: () => original.place, act: vi.fn(), actAssociation: vi.fn(), actsOn: vi.fn(), fieldValue: vi.fn(), listLanes: vi.fn(), loadChange: vi.fn(), loadIssue: vi.fn(), loadRules: vi.fn(), openRoom: vi.fn(), siteAddress: vi.fn() }));
  vi.doMock("../src/view.ts", () => ({ h: (tag: string, attrs: Record<string, string> = {}, ...children: unknown[]) => { const element = new Element(tag); for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value); element.children = children.flat().filter((child) => child !== null && child !== undefined && child !== false) as (Element | string)[]; return element; }, nonacceptedAnswerText: () => "Unknown", actsPanel: vi.fn(), answerLine: vi.fn(), changeScreen: vi.fn(), failureScreen: vi.fn(), issueScreen: vi.fn(), roomScreen: vi.fn(), rulesScreen: vi.fn() }));
  const save = vi.fn();
  vi.stubGlobal("document", { getElementById: () => root }); vi.stubGlobal("location", { origin: "https://page.test", hash: "#/settings" });
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(settings), setItem: save });
  vi.stubGlobal("window", { addEventListener: (_key: string, callback: () => void) => { redraw = callback; } });
  const drain = async () => { for (let turn = 0; turn < 20; turn++) await Promise.resolve(); };
  const click = () => { root.find((element) => element.attrs["name"] === "room")!.value = "artroom-invite:secret-fixture"; root.querySelector("#join")!.fire("click"); };
  try {
    await import("../src/main.ts"); await rendered.promise;
    const prepared = gate(), release = gate();
    join.mockImplementationOnce(async (_session, _typed, callback) => { prepared.resolve(); await release.promise; callback(); posts(); throw new Error("Must not submit"); });
    click(); await prepared.promise; click(); expect(join).toHaveBeenCalledTimes(1);
    settings = { ...original, secret: "other-key" }; release.resolve(); await drain(); expect(posts).not.toHaveBeenCalled();
    settings = original; rendered = gate(); redraw(); await rendered.promise;
    const submitted = gate(); let reply!: (value: unknown) => void;
    join.mockImplementationOnce(async (_session, typed, callback) => { expect(typed).toBe("artroom-invite:secret-fixture"); callback(); posts(); submitted.resolve(); return new Promise((resolve) => { reply = resolve; }) as never; });
    click(); await submitted.promise;
    settings = { ...original, place: { ...original.place, directory: "different-room" } };
    reply({ place: original.place, answer: { answer: "accepted" } }); await drain(); expect(save).not.toHaveBeenCalled();
    settings = original; rendered = gate(); redraw(); await rendered.promise;
    expect(root.textContent).toContain("Joining was accepted by membership");
    click(); await drain(); expect(join).toHaveBeenCalledTimes(2);
    settings = { ...original, secret: "third-key" }; rendered = gate(); redraw(); await rendered.promise;
    click(); await drain(); expect(posts).toHaveBeenCalledTimes(2);
    rendered = gate(); redraw(); await rendered.promise;
    expect(root.querySelector("#join")!.attrs["disabled"]).toBe("");
    expect(root.textContent).toContain("does not retain the exact signed request");
    click(); await drain(); expect(join).toHaveBeenCalledTimes(3);
  } finally { await drain(); vi.unstubAllGlobals(); for (const path of ["../src/data.ts", "../src/view.ts", "@generalbusiness/artroom-bytes"]) vi.doUnmock(path); }
});
