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
  let settings: { place: { directory: string; membership: { kind: string; scope: string; inc: string } }; secret: string; register: typeof register; label?: { text: string; place: { directory: string; membership: { kind: string; scope: string; inc: string } }; register: typeof register } } = { place: { directory: "room", membership: { kind: "membership", scope: "membership", inc: "one" } }, secret: "device", register };
  settings.label = { text: "Original local label", place: settings.place, register };
  let eligible = true, locked = true, failSave = false;
  let redraw!: () => void;
  let finish!: (value: unknown) => void;
  let attempted = gate();
  const claim = vi.fn((..._args: unknown[]) => { attempted.resolve(); return new Promise((resolve) => { finish = resolve; }); });
  vi.doMock("@generalbusiness/artroom-bytes", async () => ({ ...await vi.importActual<typeof import("@generalbusiness/artroom-bytes")>("@generalbusiness/artroom-bytes"), b64url: () => "device", unb64url: () => new Uint8Array(32), isScopeRef: (value: unknown) => !!value && typeof value === "object" && "kind" in value, keyIdOfSecret: () => "key" }));
  vi.doMock("../src/claim.ts", () => ({ allowedClaim: async () => { if (!eligible) throw new Error("Not founder"); return { register, definition: "platform:register@2" }; }, claimRoom: claim }));
  vi.doMock("../src/data.ts", () => ({
    openRoom: async () => ({ session: { service: "https://page.test", secret: new Uint8Array(32) }, ...settings.place, rules: "rules", name: "Recorded repository", me: { handle: "@founder" } }),
    actsOn: async () => ({ acts: [], hidden: 0 }), listLanes: async () => ({ issues: [], changes: [] }), siteAddress: () => "/site/", actAssociation: () => "association", act: vi.fn(), fieldValue: vi.fn(), joinRoom: vi.fn(), loadChange: vi.fn(), loadIssue: vi.fn(), loadRules: vi.fn(), placeOf: vi.fn(),
  }));
  vi.doMock("../src/view.ts", () => ({ h: (tag: string, attrs: Record<string, string> = {}, ...children: unknown[]) => { const element = new Element(tag); for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value); element.children = children.flat().filter((child) => child !== null && child !== undefined && child !== false) as (Element | string)[]; return element; }, roomScreen: () => new Element("main"), actsPanel: () => new Element("section"), failureScreen: () => new Element("main"), changeScreen: vi.fn(), issueScreen: vi.fn(), rulesScreen: vi.fn(), answerLine: vi.fn(), nonacceptedAnswerText: vi.fn() }));
  vi.stubGlobal("document", { getElementById: () => root }); vi.stubGlobal("HTMLDialogElement", Element);
  vi.stubGlobal("location", { origin: "https://page.test", hash: "#/" });
  const save = vi.fn((_key: string, value: string) => { if (failSave) throw new Error("Storage full"); settings = JSON.parse(value) as typeof settings; });
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
    finish({ repository: null, label: "Local intent", pending: true, outcome: { code: 1, lines: ["The original request remains pending"] } });
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    expect(input.attrs["disabled"]).toBe("");
    expect(dialog.textContent).toContain("Resume creation");
    attempted = gate(); form.fire("submit"); await attempted.promise;
    expect(claim).toHaveBeenCalledTimes(2);
    expect(claim.mock.calls[1]!.slice(0, 4)).toEqual(claim.mock.calls[0]!.slice(0, 4)); // Same adapter/binding/label, no --again or new key.
    expect((claim.mock.calls[1]![4] as { current(): boolean }).current()).toBe(true);
    failSave = true;
    finish({ repository: { directory: { scope: "created-room" }, membership: settings.place.membership }, label: "Local intent", pending: false, outcome: { code: 0, lines: [] } });
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    expect(settings.place.directory).toBe("room");
    expect(settings.label?.text).toBe("Original local label");
    expect(dialog.textContent).toContain("storage of the room settings could not be verified");
    expect(dialog.textContent).toContain("created-room");
    expect(root.find((element) => element.tag === "dialog")).toBe(dialog);
    expect(save).toHaveBeenCalledTimes(1);
    failSave = false; save.mockClear();
    attempted = gate(); form.fire("submit"); await attempted.promise;
    expect(claim).toHaveBeenCalledTimes(3);
    settings = { ...settings, place: { ...settings.place, directory: "another-room" } };
    expect((claim.mock.calls[2]![4] as { current(): boolean }).current()).toBe(false);
    finish({ repository: { directory: { scope: "new-room" }, membership: settings.place.membership }, label: "Local intent", pending: false, outcome: { code: 0, lines: [] } });
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    expect(save).not.toHaveBeenCalled();
    rendered = gate(); redraw(); await rendered.promise;
    root.find((element) => element.tag === "button" && element.textContent === "Create room")!.fire("click");
    const nextDialog = root.children.filter((element): element is Element => element instanceof Element && element.tag === "dialog").at(-1)!;
    nextDialog.find((element) => element.tag === "input")!.value = "Useful local name";
    attempted = gate(); nextDialog.find((element) => element.tag === "form")!.fire("submit"); await attempted.promise;
    rendered = gate(); finish({ repository: { directory: { scope: "verified-room" }, membership: settings.place.membership }, label: "Useful local name", pending: false, outcome: { code: 0, lines: [] } }); await rendered.promise;
    expect(settings.place.directory).toBe("verified-room");
    expect(settings.label).toEqual({ text: "Useful local name", place: settings.place, register });
    expect(root.textContent).toContain("Useful local name");
    expect(root.textContent).toContain("Recorded repository");
    settings = { ...settings, place: { ...settings.place, directory: "different-room" } };
    rendered = gate(); redraw(); await rendered.promise;
    expect(root.textContent).not.toContain("Useful local name");
    const queued = gate(), releaseQueue = gate();
    const posts = vi.fn();
    claim.mockImplementationOnce(async (...args: unknown[]) => {
      queued.resolve(); await releaseQueue.promise;
      if (!(args[4] as { current(): boolean }).current()) throw new Error("The claim context changed before submission. Nothing was sent.");
      posts();
      return { repository: null, pending: true, label: "Queued local name", outcome: { code: 1, lines: [] } };
    });
    root.find((element) => element.tag === "button" && element.textContent === "Create room")!.fire("click");
    const queuedDialog = root.children.filter((element): element is Element => element instanceof Element && element.tag === "dialog").at(-1)!;
    queuedDialog.find((element) => element.tag === "input")!.value = "Queued local name";
    queuedDialog.find((element) => element.tag === "form")!.fire("submit"); await queued.promise;
    settings = { ...settings, secret: "another-device" };
    releaseQueue.resolve(); for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    expect(posts).not.toHaveBeenCalled();
    eligible = false; rendered = gate(); redraw(); await rendered.promise;
    expect(root.find((element) => element.tag === "button" && element.textContent === "Create room")).toBeUndefined();
    eligible = true; locked = false; rendered = gate(); redraw(); await rendered.promise;
    expect(root.find((element) => element.tag === "button" && element.textContent === "Create room")).toBeUndefined();
  } finally { vi.unstubAllGlobals(); for (const path of ["../src/claim.ts", "../src/data.ts", "../src/view.ts", "@generalbusiness/artroom-bytes"]) vi.doUnmock(path); }
});
