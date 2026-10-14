import { expect, test, vi } from "vitest";
import { b64url, keyIdOfSecret, newIncarnation, scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import type { FoundingOffer } from "@generalbusiness/artroom-client";
import type { StartedRoom, StartOptions, StartStatus } from "../src/start-custody.ts";

class Element {
  children: (Element | string)[] = [];
  attrs: Record<string, string> = {};
  value = "";
  className = "";
  handlers = new Map<string, (event: { preventDefault(): void }) => void>();
  constructor(readonly tag: string) {}
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
    if (k === "value") this.value = v;
  }
  getAttribute(k: string) {
    return this.attrs[k] ?? null;
  }
  hasAttribute(k: string) {
    return Object.hasOwn(this.attrs, k);
  }
  removeAttribute(k: string) {
    delete this.attrs[k];
  }
  prepend(...c: (Element | string)[]) {
    this.children.unshift(...c);
  }
  append(...c: (Element | string)[]) {
    this.children.push(...c);
  }
  replaceChildren(...c: (Element | string)[]) {
    this.children = c;
  }
  addEventListener(k: string, f: (event: { preventDefault(): void }) => void) {
    this.handlers.set(k, f);
  }
  fire(k: string) {
    this.handlers.get(k)?.({ preventDefault() {} });
  }
  focus() {}
  click() { this.fire("click"); }
  get textContent(): string {
    return this.children
      .map((c) => (typeof c === "string" ? c : c.textContent))
      .join(" ");
  }
  set textContent(s: string) {
    this.children = [s];
  }
  all(): Element[] {
    return [
      this,
      ...this.children.flatMap((c) => (c instanceof Element ? c.all() : [])),
    ];
  }
  querySelectorAll(s: string) {
    const p = /^([a-z-]+)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/.exec(s);
    return p
      ? this.all()
          .slice(1)
          .filter(
            (e) =>
              (!p[1] || e.tag === p[1]) &&
              (!p[2] ||
                (e.hasAttribute(p[2]) &&
                  (p[3] === undefined || e.attrs[p[2]] === p[3]))),
          )
      : [];
  }
  querySelector(s: string) {
    return this.querySelectorAll(s)[0] ?? null;
  }
}

// Real Start handlers over SCRIPTED DOM, discovery/custody and room reads.
// Actual key/journal custody is in start-custody.test; native admission is separate.
test("Start is explicit; Back fences late discovery, reload only offers Check and Continue, and recovery uses the verified founder key", async () => {
  const root = new Element("div"), location = { origin: "https://start-ui.test", hash: "#/join" };
  const ref = (kind: "register" | "directory" | "membership") => ({ scope: scopeIdOf({ v: 1, kind, definition: kind === "register" ? "platform:register@8" : kind === "directory" ? "platform:directory@7" : "platform:membership@2", creator: null, cause: textDigest("SCRIPTED Start UI " + kind), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(5)), kind });
  const register = ref("register"), directory = ref("directory"), membership = ref("membership");
  const legacyRegister = { ...register, scope: scopeIdOf({ v: 1, kind: "register", definition: "platform:register@7", creator: null, cause: textDigest("SCRIPTED retained UI register"), ordinal: 0 }) };
  let selectedDirectory = directory;
  const offer: FoundingOffer = { v: 1, origin: location.origin, register, definition: "platform:register@8", at: { seq: 0, hash: textDigest("SCRIPTED head") }, registerItem: { id: 0, revision: 1, state: "open", host: "artifacts", namespace: "SCRIPTED", policy: "open", purpose: "demo-start" } };
  const seed = new Uint8Array(32).fill(63), key = keyIdOfSecret(seed);
  const values = new Map<string, string>(), blobs: Blob[] = [];
  let original: StartStatus | null = null, verified = false, complete = false, redraw!: () => void;
  let connection: { operation: string; kind: "person" | "agent-key"; handle: string; state: "unknown" | "verified" } | null = null;
  let invitationVerified = false;
  const issue = vi.fn(async (_origin: string, _storage: unknown, _expected: unknown, input: { kind: "person" | "agent-key"; handle: string }, options: { mode: string }) => {
    if (options.mode === "new") connection = { operation: "SCRIPTED connection", kind: input.kind, handle: input.handle, state: "unknown" };
    if (connection && invitationVerified) connection.state = "verified";
    return { ...connection!, ...(invitationVerified ? { link: "artroom-agent-key:SCRIPTED-private-link" } : { reason: "SCRIPTED original invitation reply lost" }) };
  });
  const files = vi.fn(async () => ({ config: JSON.stringify({ repository: { directory: selectedDirectory, membership }, handle: "@founder" }), key: b64url(seed) + "\n" }));
  const recovery = vi.fn(async () => { if (original) original = { ...original, recoverySaved: true }; return b64url(seed) + "\n"; });
  let finishOffer!: (value: FoundingOffer) => void;
  const offerRead = vi.fn(() => new Promise<FoundingOffer>(resolve => { finishOffer = resolve; }));
  const start = vi.fn(async (_origin: string, _storage: unknown, _options: StartOptions): Promise<StartedRoom> => {
    original = { key, configured: _options.mode === "new" ? { register, definition: "platform:register@8" } : original!.configured, handle: "@founder", label: "Personal intent", operation: "original", state: complete ? "complete" : "pending" };
    return { key, configured: original.configured, handle: "@founder", operation: "original", label: "Personal intent", pending: !complete, repository: complete ? { directory: selectedDirectory, membership, rules: directory.scope, destination: membership.scope } : null, outcome: { code: complete ? 0 : 1, lines: ["SCRIPTED original pending"] }, ...(complete ? { secret: seed.slice() } : {}) };
  });
  const save = vi.fn((name: string, text: string) => { values.set(name, text); });
  vi.doMock("@generalbusiness/artroom-client", async () => ({ ...await vi.importActual<typeof import("@generalbusiness/artroom-client")>("@generalbusiness/artroom-client"), foundingOffer: offerRead }));
  vi.doMock("../src/connection-custody.ts", () => ({ connectInvitation: issue, originalConnection: () => connection, founderConnectionFiles: files, saveFounderRecoveryOnce: recovery }));
  vi.doMock("../src/start-custody.ts", () => ({ originalStart: () => original, startRoom: start }));
  vi.doMock("../src/data.ts", async () => ({ ...await vi.importActual<typeof import("../src/data.ts")>("../src/data.ts"), openRoom: async (session: { service: string; secret: Uint8Array }) => ({ session, directory: selectedDirectory.scope, membership, key, name: "Recorded host name", me: verified ? { handle: "@founder", role: "admin", actions: [], ref: { membership, member: "@founder" } } : null }) }));
  vi.doMock("../src/view.ts", async () => ({ ...await vi.importActual<typeof import("../src/view.ts")>("../src/view.ts"), h: (tag: string, attrs: Record<string, string> = {}, ...children: unknown[]) => { const element = new Element(tag); for (const [k, v] of Object.entries(attrs)) element.setAttribute(k, v); element.children = children.flat().filter(child => child !== null && child !== undefined && child !== false) as (Element | string)[]; return element; } }));
  vi.stubGlobal("document", { title: "", getElementById: () => root, activeElement: null, createElement: () => new Element("a") });
  vi.stubGlobal("location", location); vi.stubGlobal("localStorage", { getItem: (name: string) => values.get(name) ?? null, setItem: save });
  vi.stubGlobal("window", { addEventListener: (_name: string, fn: () => void) => { redraw = fn; } });
  const createUrl = vi.spyOn(URL, "createObjectURL").mockImplementation(blob => { if (!(blob instanceof Blob)) throw new Error("SCRIPTED expected Blob"); blobs.push(blob); return "blob:SCRIPTED"; });
  const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const flush = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
  const find = (tag: string, text?: string) => root.all().find(e => e.tag === tag && (text === undefined || e.textContent === text))!;
  try {
    await import("../src/main.ts"); await flush();
    expect(find("h1").textContent).toBe("Join or create a room");
    expect(root.all().filter(e => e.attrs["class"] === "entry-intro")).toHaveLength(0);
    const choices = root.all().filter(e => e.attrs["class"] === "entry-choice");
    expect(choices.map(e => [e.attrs["href"], e.all().find(child => child.tag === "h2")?.textContent, e.all().find(child => child.tag === "p")?.textContent])).toEqual([
      ["#/start", "Create a new room", "Start a new room for shared work"],
      ["#/invitation", "Join with an invitation link", "Paste a link. We create your key and join the room."],
      ["#/config", "Join with a config and key", "Use config.json and its matching device key."],
    ]);
    expect(start).not.toHaveBeenCalled(); expect(offerRead).not.toHaveBeenCalled();
    location.hash = choices[0]!.attrs["href"]!; redraw(); await flush();
    expect(root.textContent).toContain("Start a room"); expect(root.all().some(e => e.attrs["type"] === "email")).toBe(false);
    expect(start).not.toHaveBeenCalled(); expect(offerRead).not.toHaveBeenCalled();
    // Missing discovery is explained without starting custody or changing the connection.
    offerRead.mockRejectedValueOnce(new Error("SCRIPTED same-origin founding offer is unavailable or invalid"));
    find("input").value = "Personal intent"; find("form").fire("submit"); await flush();
    expect(root.textContent).toContain("This service is not set up to create rooms. Nothing was sent.");
    expect(start).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(values.size).toBe(0); expect(original).toBeNull();
    expect(location.hash).toBe("#/start");
    find("input").value = "Personal intent"; find("form").fire("submit");
    expect(offerRead).toHaveBeenCalledTimes(2);
    location.hash = "#/join"; redraw(); finishOffer(offer); await flush();
    expect(start).not.toHaveBeenCalled(); expect(root.textContent).toContain("Join with an invitation link"); expect(root.textContent).toContain("Join with a config and key");
    location.hash = "#/start"; redraw(); find("input").value = "Personal intent"; find("form").fire("submit"); finishOffer(offer); await flush();
    expect(start).toHaveBeenCalledTimes(1); expect(start.mock.calls[0]![2].mode).toBe("new");
    expect(start.mock.calls[0]![2].offer?.definition).toBe("platform:register@8");
    // Reloaded legacy custody is not retargeted to the current fresh offer.
    original = { ...original!, configured: { register: legacyRegister, definition: "platform:register@7" } };
    selectedDirectory = { ...directory, scope: scopeIdOf({ v: 1, kind: "directory", definition: "platform:directory@3", creator: null, cause: textDigest("SCRIPTED retained UI directory"), ordinal: 0 }) };
    redraw(); await flush(); expect(start).toHaveBeenCalledTimes(1); expect(find("input").hasAttribute("disabled")).toBe(true);
    start.mockRejectedValueOnce(new Error("SCRIPTED original custody remains unavailable"));
    find("button", "Check status").fire("click"); await flush();
    expect(start.mock.calls.at(-1)![2].mode).toBe("check"); expect(offerRead).toHaveBeenCalledTimes(3);
    expect(root.textContent).toContain("SCRIPTED original custody remains unavailable");
    find("form").fire("submit"); await flush(); expect(start.mock.calls.at(-1)![2].mode).toBe("continue");
    expect(original!.configured).toEqual({ register: legacyRegister, definition: "platform:register@7" });
    const selectOriginal = start.mock.calls.at(-1)![2].foundingOffer!;
    const selectedOffer = selectOriginal(legacyRegister);
    expect(offerRead.mock.calls.at(-1)).toEqual([location.origin, { register: legacyRegister }]);
    finishOffer({ ...offer, register: legacyRegister, definition: "platform:register@7" });
    expect((await selectedOffer).definition).toBe("platform:register@7");
    const wrongOffer = selectOriginal(legacyRegister); finishOffer(offer);
    await expect(wrongOffer).rejects.toThrow("offered register changed");
    complete = true; find("button", "Check status").fire("click"); await flush();
    expect(save).not.toHaveBeenCalled(); expect(root.textContent).toContain("has not verified"); expect(document.title).toBe("dap - workroom");
    verified = true; find("button", "Check status").fire("click"); await flush();
    expect(root.textContent).toContain("Your room is ready"); expect(document.title).toBe("dap - workroom Recorded host name");
    expect(root.textContent).toContain("Invite people"); expect(root.textContent).toContain("Connect command line"); expect(root.textContent).toContain("Connect an agent");
    root.all().find(e => e.tag === "button" && e.textContent.startsWith("Get connection files"))!.fire("click"); await flush();
    expect(files).toHaveBeenCalledTimes(1); expect(blobs).toHaveLength(2);
    expect((await blobs[1]!.text()).trim() === b64url(seed)).toBe(true);
    const config = JSON.parse(await blobs[0]!.text()); expect(config.repository.membership).toEqual(membership); expect(config.handle).toBe("@founder");
    find("button", "Save a recovery file").fire("click"); await flush();
    find("button", "Save a recovery file").fire("click"); await flush();
    expect(recovery).toHaveBeenCalledTimes(1); expect(blobs).toHaveLength(3); expect((await blobs[2]!.text()).trim() === b64url(seed)).toBe(true);
    root.all().find(e => e.tag === "button" && e.textContent.startsWith("Create invitation"))!.fire("click");
    const connectionForm = root.all().filter(e => e.tag === "form").at(-1)!;
    root.all().find(e => e.attrs["name"] === "handle")!.value = "@guest";
    connectionForm.fire("submit"); await flush(); connectionForm.fire("submit"); await flush();
    expect(issue).toHaveBeenCalledTimes(1); expect(issue.mock.calls[0]![4].mode).toBe("new");
    root.all().filter(e => e.tag === "button" && e.textContent === "Check status").at(-1)!.fire("click"); await flush();
    expect(issue.mock.calls.at(-1)![4].mode).toBe("check");
    find("button", "Continue original connection").fire("click"); await flush();
    expect(issue.mock.calls.at(-1)![4].mode).toBe("continue"); expect(save).not.toHaveBeenCalled();
    root.all().find(e => e.tag === "button" && e.textContent.startsWith("Create agent invitation"))!.fire("click");
    expect(root.textContent).toContain("Original person invitation for @guest");
    expect(root.textContent).toContain("Another connection is already in progress");
    invitationVerified = true;
    find("button", "Continue original connection").fire("click"); await flush();
    root.all().find(e => e.tag === "button" && e.textContent.startsWith("Create agent invitation"))!.fire("click");
    root.all().find(e => e.attrs["name"] === "handle")!.value = "@agent";
    root.all().filter(e => e.tag === "form").at(-1)!.fire("submit"); await flush();
    expect(issue.mock.calls.at(-1)![3].kind).toBe("agent-key");
    expect(root.textContent).toContain("dap join <private invitation link>");
    expect(root.textContent).toContain("dap join <same-private-link> --check");
    expect(root.textContent).toContain("new owner-only ARTROOM_HOME directory");
    // A late ready-screen action cannot replace a newly selected connection.
    values.set("artroom-page", JSON.stringify({ place: null, secret: b64url(new Uint8Array(32).fill(64)) }));
    find("button", "Open room").fire("click"); expect(save).not.toHaveBeenCalled();
  } finally {
    createUrl.mockRestore(); revokeUrl.mockRestore(); vi.unstubAllGlobals();
    for (const path of ["@generalbusiness/artroom-client", "../src/start-custody.ts", "../src/connection-custody.ts", "../src/data.ts", "../src/view.ts"]) vi.doUnmock(path);
  }
});
