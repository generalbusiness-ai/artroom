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
    prepend(...children: (Element | string)[]) { this.children.unshift(...children); }
    replaceChildren(...children: (Element | string)[]) { this.children = children; if (this === root) rendered.resolve(); }
    addEventListener(name: string, handler: (event: { preventDefault(): void }) => void) { this.handlers.set(name, handler); }
    focus() {}
    removeAttribute(name: string) { delete this.attrs[name]; }
    hasAttribute(name: string) { return Object.hasOwn(this.attrs, name); }
    querySelector(selector: string) { return selector.includes("data-action-slot") ? new Element("div") : null; }
    querySelectorAll() { return []; }
    set textContent(value: string) { this.children = [value]; }
    get textContent(): string { return this.children.map((child) => typeof child === "string" ? child : child.textContent).join(" "); }
  }
  const root = new Element("div");
  type Place = { directory: string; membership: { scope: string; kind: string; inc: string } };
  let context: { place: Place; secret: string; label?: { text: string; place: Place } } = { place: { directory: "directory", membership: { scope: "membership", kind: "membership", inc: "one" } }, secret: "device" };
  const room = { session: { service: "https://page.test", secret: new Uint8Array(32) }, ...context.place, rules: "rules", key: "key", me: null };
  let redraw!: () => void;
  let send!: (kind: string, on: string, fields: Record<string, string>, accepted?: () => void) => void;
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
  const issueRead = vi.fn(async () => ({ state: "closed", intent: 0 }));
  // The scripted reads are resolved promises. Drain their finite microtask
  // chain before checking that a forbidden callback created no second act.
  const drain = async () => { for (let turn = 0; turn < 20; turn++) await Promise.resolve(); };
  vi.doMock("@generalbusiness/artroom-bytes", async () => ({ ...await vi.importActual<typeof import("@generalbusiness/artroom-bytes")>("@generalbusiness/artroom-bytes"), b64url: () => "device", unb64url: () => new Uint8Array(32), keyIdOfSecret: () => "key", isScopeRef: (value: unknown) => !!value && typeof value === "object" && "kind" in value }));
  vi.doMock("../src/data.ts", () => ({
    act: dataAct, actAssociation: (_room: unknown, scope: string) => `room/member/${scope}`, actsOn: async () => ({ acts: ["comment", "close-own", "close-any", "reopen-own", "merge", "review-verdict", "ready-own"].map((kind) => ({ kind, fields: [] })), hidden: 0 }), fieldValue: (_room: unknown, _type: unknown, value: string) => value,
    openRoom: async () => ({ ...room, directory: context.place.directory, membership: context.place.membership }), listLanes: async () => ({ issues: [], changes: [] }), siteAddress: () => "/site/", placeOf: () => null,
    joinRoom: vi.fn(), loadChange: async () => ({ state: "open", manifests: [{ id: 1, state: "current", file: { path: "../unsafe.md" } }], merges: [] }), loadIssue: issueRead, loadRules: vi.fn(),
  }));
  vi.doMock("../src/view.ts", () => ({
    icon: () => new Element("svg"),
    h: (tag: string, attrs: Record<string, string> = {}, ...children: unknown[]) => { const el = new Element(tag); el.attrs = attrs; el.children = children.flat().filter((child) => child !== null && child !== false && child !== undefined) as (Element | string)[]; return el; },
    roomScreen: () => new Element("main"), issueScreen: () => new Element("main"), changeScreen: () => new Element("main"), rulesScreen: vi.fn(), failureScreen: vi.fn(), answerLine: (result: { kind: string; answer: { answer: string } }) => { const line = new Element("p"); line.append(`Known ${result.kind} ${result.answer.answer}`); return line; }, nonacceptedAnswerText: vi.fn(),
    actsPanel: (_offered: unknown, callback: typeof send, last: Element | null, options: (typeof panels)[number]) => { send = callback; panels.push(options); const panel = new Element("section"); if (last) panel.append(last); return panel; },
  }));
  vi.stubGlobal("document", { getElementById: () => root, createElement: (tag: string) => new Element(tag) });
  const location = { origin: "https://page.test", hash: "#/" };
  vi.stubGlobal("location", location);
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(context) });
  vi.stubGlobal("window", { addEventListener: (_name: string, callback: () => void) => { redraw = callback; } });
  vi.stubGlobal("alert", vi.fn());
  try {
    await import("../src/main.ts");
    await rendered.promise;
    expect(panels.length).toBeGreaterThan(0);
    const beforePending = panels.length;
    send("comment", "", Object.fromEntries([["__proto__", "literal field"]]));
    await attempt.promise;
    expect(panels.length).toBe(beforePending); // Local fencing preserves the subject without starting another view read.
    expect(root.textContent).toContain("Sending request");
    rendered = gate();
    redraw();
    await rendered.promise;
    expect(panels.at(-1)?.pending).toBe(true);
    send("comment", "", {});
    await drain();
    expect(dataAct).toHaveBeenCalledTimes(1);
    expect((dataAct.mock.calls[0]![3] as { fields: Record<string, unknown> }).fields["__proto__"]).toBe("literal field");
    rejects[0]!(new Error("Reply lost after submit"));
    await drain();
    rendered = gate(); redraw();
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
    expect(panels.at(-1)?.primary).toEqual([]); // Primary tasks live beside the subject, not the Inspect panel.
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
    release.resolve(); await drain();
    rendered = gate(); redraw(); await rendered.promise;
    expect(posts).toHaveBeenCalledTimes(1); // Only the earlier lost-reply submission.
    expect(panels.at(-1)?.pending).toBe(false);
    expect(panels.at(-1)?.uncertain).toBe(false);
    expect(posts).toHaveBeenCalledTimes(1);
    const reading = gate(), releaseRead = gate();
    issueRead.mockImplementationOnce(async () => { reading.resolve(); await releaseRead.promise; return { state: "closed", intent: 0 }; });
    location.hash = "#/issue/delayed";
    redraw(); await reading.promise;
    context = { ...context, place: { ...context.place, directory: "newest-room" } };
    context.label = { text: "Newest local label", place: context.place };
    rendered = gate(); releaseRead.resolve(); await rendered.promise;
    expect(root.textContent).toContain("Newest local label");
    expect(root.textContent).toContain("Room est-room");
    expect(root.textContent).not.toContain("Room ther-roo");
    context = { ...context, secret: "device" };
    rendered = gate(); redraw(); await rendered.promise;
    const retired = vi.fn();
    for (const answer of ["refused", "accepted"] as const) {
      dataAct.mockImplementationOnce(async (...args: unknown[]) => {
        (args[5] as () => void)();
        const result = { kind: "comment", answer: { answer }, observation: null };
        (args[4] as (value: unknown) => void)(result);
        return result as never;
      });
      rendered = gate(); send("comment", "", { body: "Exact submission" }, retired); await drain();
      expect(retired).toHaveBeenCalledTimes(answer === "accepted" ? 1 : 0);
    }
    const answered = gate(), observation = gate();
    dataAct.mockImplementationOnce(async (...args: unknown[]) => {
      (args[5] as () => void)();
      const result = { kind: "held admission", answer: { answer: "accepted" }, observation: "Observation refresh pending." };
      (args[4] as (value: unknown) => void)(result); answered.resolve();
      await observation.promise; result.observation = "The observation could not be read."; return result as never;
    });
    const beforeAnswer = panels.length;
    send("comment", "", { body: "Known before observation" }, retired); await answered.promise;
    expect(root.textContent).toContain("Known held admission accepted");
    expect(panels.length).toBe(beforeAnswer);
    expect(retired).toHaveBeenCalledTimes(2);
    rendered = gate(); observation.resolve(); await rendered.promise;
    expect(panels.at(-1)?.uncertain).toBe(true);
    expect(root.textContent).toContain("Known held admission accepted");
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
