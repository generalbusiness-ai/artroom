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
  const target = { directory: "joined-room", membership: { kind: "membership", scope: "target-membership", inc: "two" } };
  let invitationTarget = target;
  let settings = original;
  let redraw!: () => void;
  const posts = vi.fn();
  const join = vi.fn(async (_session: unknown, _typed: string, callback: () => void) => { callback(); posts(); throw new Error("Reply lost"); });
  const decoded = (value: string) => new Uint8Array(32).fill(value === "typed-joining-key" ? 8 : value === "third-key" ? 3 : value === "fresh-key" ? 4 : 0);
  const bytes = await vi.importActual<typeof import("@generalbusiness/artroom-bytes")>("@generalbusiness/artroom-bytes");
  vi.doMock("@generalbusiness/artroom-bytes", async () => ({ ...bytes, unb64url: decoded, keyIdOfSecret: (secret: Uint8Array) => `key${secret[0]}`, isScopeRef: () => false }));
  vi.doMock("../src/data.ts", () => ({ enrollmentAssociation: (session: { service: string; secret: Uint8Array }, membership: unknown) => bytes.canonicalize([session.service, membership, `key${session.secret[0]}`]), joinAssociation: (session: { service: string; secret: Uint8Array }) => bytes.canonicalize([session.service, invitationTarget.membership, `key${session.secret[0]}`]), joinRoom: join, placeOf: () => invitationTarget, act: vi.fn(), actAssociation: vi.fn(), actsOn: vi.fn(), fieldValue: vi.fn(), listLanes: vi.fn(), loadChange: vi.fn(), loadIssue: vi.fn(), loadRules: vi.fn(), openRoom: vi.fn(), siteAddress: vi.fn() }));
  vi.doMock("../src/view.ts", () => ({ icon: () => new Element("svg"), h: (tag: string, attrs: Record<string, string> = {}, ...children: unknown[]) => { const element = new Element(tag); for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value); element.children = children.flat().filter((child) => child !== null && child !== undefined && child !== false) as (Element | string)[]; return element; }, nonacceptedAnswerText: () => "Unknown", actsPanel: vi.fn(), answerLine: vi.fn(), changeScreen: vi.fn(), failureScreen: vi.fn(), issueScreen: vi.fn(), roomScreen: vi.fn(), rulesScreen: vi.fn() }));
  const save = vi.fn((_key: string, value: string) => { settings = JSON.parse(value) as typeof settings; });
  const location = { origin: "https://page.test", hash: "#/settings" };
  vi.stubGlobal("document", { getElementById: () => root }); vi.stubGlobal("location", location);
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
    join.mockImplementationOnce(async (session, typed, callback) => { expect((session as { secret: Uint8Array }).secret).toEqual(new Uint8Array(32).fill(8)); expect(typed).toBe("artroom-invite:secret-fixture"); callback(); posts(); submitted.resolve(); return new Promise((resolve) => { reply = resolve; }) as never; });
    root.find((element) => element.attrs["name"] === "secret")!.value = "typed-joining-key";
    click(); await submitted.promise;
    settings = { place: { directory: "different-room", membership: { kind: "membership", scope: "other-membership", inc: "three" } }, secret: "other-key" };
    const joinedPlace = target;
    reply({ place: joinedPlace, answer: { answer: "accepted", receipt: { intent: "digest_original", definition: "platform:membership@2", fact: { at: target.membership, seq: 12, hash: "entry_original" } } } }); await drain(); expect(save).not.toHaveBeenCalled();
    settings = original; rendered = gate(); redraw(); await rendered.promise;
    expect(root.textContent).toContain("Joining was accepted by membership");
    expect(root.textContent).toContain("entry_original");
    root.find((element) => element.attrs["name"] === "secret")!.value = "typed-joining-key";
    click(); await drain(); expect(join).toHaveBeenCalledTimes(2);
    invitationTarget = { directory: "independent-room", membership: { kind: "membership", scope: "independent-membership", inc: "four" } };
    root.find((element) => element.attrs["name"] === "secret")!.value = "fresh-key";
    root.find((element) => element.attrs["name"] === "room")!.fire("input");
    expect(root.querySelector("#join")!.attrs["disabled"]).toBeUndefined();
    click(); await drain();
    expect(join).toHaveBeenCalledTimes(3); expect(posts).toHaveBeenCalledTimes(2);
    invitationTarget = target;
    root.find((element) => element.tag === "button" && element.textContent === "Use joined room")!.fire("click");
    expect(settings).toEqual({ place: joinedPlace, secret: "typed-joining-key" });
    expect(location.hash).toBe("#/");
    expect(join).toHaveBeenCalledTimes(3);
    location.hash = "#/settings";
    settings = { ...original, place: { ...original.place, directory: "selected-before-unknown" }, secret: "third-key" }; rendered = gate(); redraw(); await rendered.promise;
    click(); await drain(); expect(posts).toHaveBeenCalledTimes(3);
    rendered = gate(); redraw(); await rendered.promise;
    root.find((element) => element.attrs["name"] === "room")!.value = "artroom-invite:secret-fixture";
    root.find((element) => element.attrs["name"] === "room")!.fire("input");
    expect(root.querySelector("#join")!.attrs["disabled"]).toBe("");
    expect(root.textContent).toContain("does not retain the exact signed request");
    click(); await drain(); expect(join).toHaveBeenCalledTimes(4);
    root.find((element) => element.tag === "form")!.fire("submit"); // Save the same invitation target/key, changing selected room.
    location.hash = "#/settings"; rendered = gate(); redraw(); await rendered.promise;
    click(); await drain(); expect(join).toHaveBeenCalledTimes(4); expect(posts).toHaveBeenCalledTimes(3);
    root.find((element) => element.attrs["name"] === "room")!.fire("input");
    expect(root.querySelector("#join")!.attrs["disabled"]).toBe("");
    settings = { ...settings, secret: "fresh-key" }; rendered = gate(); redraw(); await rendered.promise;
    click(); await drain(); expect(join).toHaveBeenCalledTimes(5); expect(posts).toHaveBeenCalledTimes(4);
  } finally { await drain(); vi.unstubAllGlobals(); for (const path of ["../src/data.ts", "../src/view.ts", "@generalbusiness/artroom-bytes"]) vi.doUnmock(path); }
});
