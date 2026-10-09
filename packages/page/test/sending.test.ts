import { expect, test, vi } from "vitest";

// The real shell handlers over a minimal DOM and a scripted data boundary.
// No browser, native scope or transport runs; the submit-phase callback is
// the boundary under test, including navigation while the reply is pending.
test("the shell fences the whole scope during a submit and keeps a lost reply read-only after redraw", async () => {
  const gate = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };
  let rendered = gate();
  class Element {
    children: (Element | string)[] = [];
    attrs: Record<string, string> = {};
    handlers = new Map<string, (event: { preventDefault(): void }) => void>();
    constructor(readonly tag: string) {}
    setAttribute(name: string, value: string) { this.attrs[name] = value; }
    append(...children: (Element | string)[]) { this.children.push(...children); }
    replaceChildren(...children: (Element | string)[]) { this.children = children; rendered.resolve(); }
    addEventListener(name: string, handler: (event: { preventDefault(): void }) => void) { this.handlers.set(name, handler); }
    focus() {}
    get textContent(): string { return this.children.map((child) => typeof child === "string" ? child : child.textContent).join(" "); }
  }
  const root = new Element("div");
  let context = { place: { directory: "directory", membership: { scope: "membership", kind: "membership", inc: "one" } }, secret: "device" };
  const room = { session: { service: "https://page.test", secret: new Uint8Array(32) }, ...context.place, rules: "rules", key: "key", me: null };
  let redraw!: () => void;
  let send!: (kind: string, on: string, fields: Record<string, string>) => void;
  const panels: { pending?: boolean; uncertain?: boolean; primary?: readonly string[]; blockedKinds?: readonly string[] }[] = [];
  const rejects: ((error: Error) => void)[] = [];
  const posts = vi.fn();
  const attempt = gate();
  const dataAct = vi.fn(async (...args: unknown[]) => {
    (args[5] as () => void)();
    posts();
    attempt.resolve();
    return new Promise<never>((_resolve, reject) => { rejects.push(reject); });
  });
  // The scripted reads are resolved promises. Drain their finite microtask
  // chain before checking that a forbidden callback created no second act.
  const drain = async () => { for (let turn = 0; turn < 20; turn++) await Promise.resolve(); };
  vi.doMock("@generalbusiness/artroom-bytes", async () => ({ ...await vi.importActual<typeof import("@generalbusiness/artroom-bytes")>("@generalbusiness/artroom-bytes"), b64url: () => "device", unb64url: () => new Uint8Array(32), keyIdOfSecret: () => "key" }));
  vi.doMock("../src/data.ts", () => ({
    act: dataAct, actAssociation: (_room: unknown, scope: string) => `room/member/${scope}`, actsOn: async () => ({ acts: ["comment", "close-own", "close-any", "reopen-own", "merge", "review-verdict", "ready-own"].map((kind) => ({ kind, fields: [] })), hidden: 0 }), fieldValue: (_room: unknown, _type: unknown, value: string) => value,
    openRoom: async () => room, listLanes: async () => ({ issues: [], changes: [] }), siteAddress: () => "/site/", placeOf: () => null,
    joinRoom: vi.fn(), loadChange: async () => ({ state: "open", manifests: [{ id: 1, state: "current", file: { path: "../unsafe.md" } }], merges: [] }), loadIssue: async () => ({ state: "closed", intent: 0 }), loadRules: vi.fn(),
  }));
  vi.doMock("../src/view.ts", () => ({
    h: (tag: string, attrs: Record<string, string> = {}, ...children: unknown[]) => { const el = new Element(tag); el.attrs = attrs; el.children = children.flat().filter((child) => child !== null && child !== false && child !== undefined) as (Element | string)[]; return el; },
    roomScreen: () => new Element("main"), issueScreen: () => new Element("main"), changeScreen: () => new Element("main"), rulesScreen: vi.fn(), failureScreen: vi.fn(), answerLine: vi.fn(), nonacceptedAnswerText: vi.fn(),
    actsPanel: (_offered: unknown, callback: typeof send, _last: unknown, options: (typeof panels)[number]) => { send = callback; panels.push(options); return new Element("section"); },
  }));
  vi.stubGlobal("document", { getElementById: () => root });
  const location = { origin: "https://page.test", hash: "#/" };
  vi.stubGlobal("location", location);
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(context) });
  vi.stubGlobal("window", { addEventListener: (_name: string, callback: () => void) => { redraw = callback; } });
  vi.stubGlobal("alert", vi.fn());
  try {
    await import("../src/main.ts");
    await rendered.promise;
    expect(panels.length).toBeGreaterThan(0);
    send("comment", "", Object.fromEntries([["__proto__", "literal field"]]));
    await attempt.promise;
    rendered = gate();
    redraw();
    await rendered.promise;
    expect(panels.at(-1)?.pending).toBe(true);
    send("comment", "", {});
    await drain();
    expect(dataAct).toHaveBeenCalledTimes(1);
    expect((dataAct.mock.calls[0]![3] as { fields: Record<string, unknown> }).fields["__proto__"]).toBe("literal field");
    rendered = gate();
    rejects[0]!(new Error("Reply lost after submit"));
    await rendered.promise;
    expect(panels.at(-1)?.uncertain).toBe(true);
    expect(root.textContent).toContain("does not retain the exact signed request");
    const beforeRedraw = panels.length;
    rendered = gate();
    redraw();
    await rendered.promise;
    expect(panels.length).toBeGreaterThan(beforeRedraw);
    expect(panels.at(-1)?.pending).toBe(false);
    send("comment", "", {});
    await drain();
    expect(dataAct).toHaveBeenCalledTimes(1);
    location.hash = "#/issue/closed-issue";
    rendered = gate(); redraw(); await rendered.promise;
    expect(panels.at(-1)?.primary).toEqual(["comment", "reopen-own"]);
    expect(panels.at(-1)?.blockedKinds).toEqual(["close-own", "close-any"]);
    send("close-own", "0", {});
    await drain();
    expect(dataAct).toHaveBeenCalledTimes(1);
    location.hash = "#/change/invalid-change";
    rendered = gate(); redraw(); await rendered.promise;
    expect(panels.at(-1)?.primary).not.toContain("merge");
    expect(panels.at(-1)?.blockedKinds).toContain("merge");
    send("merge", "", {});
    await drain();
    expect(dataAct).toHaveBeenCalledTimes(1);
    const beforeSubmit = gate(), release = gate();
    dataAct.mockImplementationOnce(async (...args: unknown[]) => {
      beforeSubmit.resolve();
      await release.promise; // Models data.act's awaited reads/intent before POST.
      (args[5] as () => void)();
      posts();
      throw new Error("This would be a POST if the callback did not reject");
    });
    send("comment", "", {});
    await beforeSubmit.promise;
    context = { ...context, place: { ...context.place, directory: "another-room" }, secret: "another-key" };
    rendered = gate(); release.resolve(); await rendered.promise;
    expect(posts).toHaveBeenCalledTimes(1); // Only the earlier lost-reply submission.
    expect(panels.at(-1)?.pending).toBe(false);
    expect(panels.at(-1)?.uncertain).toBe(false);
    expect(alert).toHaveBeenCalledWith("The room or key changed before submission. Nothing was sent.");
  } finally {
    // Controls may admit forbidden extra attempts. Reject and drain every
    // one while its DOM remains installed, so a distinguishing assertion
    // never leaves a redraw running after the globals are restored.
    for (const reject of rejects) reject(new Error("End of scripted attempt"));
    await drain();
    vi.unstubAllGlobals();
    vi.doUnmock("../src/data.ts"); vi.doUnmock("../src/view.ts"); vi.doUnmock("@generalbusiness/artroom-bytes");
  }
});
