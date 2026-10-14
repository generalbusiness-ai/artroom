import { expect, test, vi } from "vitest";
import {
  b64url,
  keyIdOfSecret,
  newIncarnation,
  scopeIdOf,
  textDigest,
} from "@generalbusiness/artroom-bytes";

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

// Actual entry handlers over scripted DOM/enrollment ports. Native exact
// envelope persistence and verification belong to join-custody.test.ts.
test("Invitation paste joins automatically once; Back and reload keep unknown enrollment fenced without premature room navigation", async () => {
  const root = new Element("div"),
    location = { origin: "https://page.test", hash: "#/invitation" };
  const seed = new Uint8Array(32).fill(81),
    key = keyIdOfSecret(seed);
  const membership = {
    kind: "membership" as const,
    scope: scopeIdOf({
      v: 1,
      kind: "membership",
      definition: "platform:membership@2",
      creator: null,
      cause: textDigest("UI fake membership"),
      ordinal: 0,
    }),
    inc: newIncarnation(new Uint8Array(16).fill(3)),
  };
  const place = {
    directory: scopeIdOf({
      v: 1,
      kind: "directory",
      definition: "platform:directory@2",
      creator: null,
      cause: textDigest("UI fake directory"),
      ordinal: 0,
    }),
    membership,
  };
  const publicOriginal = { status: "unknown", key, place, handle: "@ada" };
  const values = new Map<string, string>();
  let redraw!: () => void,
    posts = 0,
    checks = 0;
  let finish!: (result: unknown) => void;
  const join = vi.fn(async () => {
    posts++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const original = () =>
    values.has("SCRIPTED-original") ? publicOriginal : null;
  const check = vi.fn(async (): Promise<unknown> => {
    checks++;
    return {
      ...publicOriginal,
      reason:
        "The original enrollment remains unknown. No replacement was sent.",
    };
  });
  vi.doMock("../src/join-custody.ts", () => ({
    joinInvitation: join,
    originalJoin: original,
    checkOriginal: check,
  }));
  const view =
    await vi.importActual<typeof import("../src/view.ts")>("../src/view.ts");
  vi.doMock("../src/view.ts", () => ({
    ...view,
    icon: () => new Element("svg"),
    h: (
      tag: string,
      attrs: Record<string, string> = {},
      ...children: unknown[]
    ) => {
      const e = new Element(tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      e.children = children
        .flat()
        .filter((c) => c !== null && c !== undefined && c !== false) as (
        Element | string
      )[];
      return e;
    },
  }));
  vi.stubGlobal("document", {
    title: "",
    activeElement: null,
    getElementById: () => root,
  });
  vi.stubGlobal("location", location);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
  vi.stubGlobal("window", {
    addEventListener: (_k: string, f: () => void) => {
      redraw = f;
    },
  });
  const drain = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  try {
    await import("../src/main.ts");
    const entryWordmarks = root.all().filter(element => element.tag === "a" && element.attrs["aria-label"] === "dap homepage");
    expect(entryWordmarks).toHaveLength(1);
    expect(entryWordmarks[0]!.attrs["href"]).toBe("https://dap.generalbusiness.ai/");
    expect(entryWordmarks[0]!.children).toHaveLength(2);
    const input = root.all().find((e) => e.attrs["name"] === "invitation")!;
    expect(
      root
        .all()
        .some((e) => e.attrs["name"] === "key" || e.attrs["name"] === "secret"),
    ).toBe(false);
    expect(
      root
        .all()
        .filter((e) => e.tag === "button")
        .map((e) => e.textContent),
    ).toEqual(["Check status"]);
    expect(root.textContent).not.toMatch(
      /Settings|Save settings|Create key|Your key|Issues|Changes|Rules/,
    );
    input.value = "artroom-invite:SCRIPTED complete invitation";
    input.fire("input");
    input.fire("input");
    expect(posts).toBe(1);
    values.set("SCRIPTED-original", b64url(new Uint8Array([1]))); // Public fixture presence only; no real secret or envelope.
    location.hash = "#/join";
    redraw();
    expect(root.all().find(e => e.tag === "h1")?.textContent).toBe("Join or create a room");
    finish({
      ...publicOriginal,
      reason: "The original enrollment remains unknown.",
    });
    await drain();
    expect(values.has("artroom-page")).toBe(false);
    location.hash = "#/invitation";
    redraw();
    const restored = root.all().find((e) => e.attrs["name"] === "invitation")!;
    expect(restored.hasAttribute("disabled")).toBe(true);
    restored.fire("input");
    expect(posts).toBe(1);
    root
      .all()
      .find((e) => e.tag === "button" && e.textContent === "Check status")!
      .fire("click");
    await drain();
    expect(checks).toBe(1);
    expect(posts).toBe(1);
    // A new module instance stands for reload; durable port presence survives.
    vi.resetModules();
    await import("../src/main.ts");
    expect(
      root
        .all()
        .find((e) => e.attrs["name"] === "invitation")!
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(posts).toBe(1);
    expect(root.textContent).not.toMatch(/Your key|Issues|Changes|Rules/);
    expect(document.title).toBe("dap - workroom");
    let checked!: (result: unknown) => void;
    check.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          checked = resolve;
        }),
    );
    root
      .all()
      .find((e) => e.tag === "button" && e.textContent === "Check status")!
      .fire("click");
    await drain();
    location.hash = "#/join";
    redraw();
    checked({
      ...publicOriginal,
      status: "verified",
      secret: seed,
      answer: { answer: "accepted" },
    });
    await drain();
    expect(values.has("artroom-page")).toBe(false);
    expect(location.hash).toBe("#/join");
  } finally {
    await drain();
    vi.unstubAllGlobals();
    vi.doUnmock("../src/join-custody.ts");
    vi.doUnmock("../src/view.ts");
    vi.resetModules();
  }
});

// Independent scripted first-refusal custody. This does not classify a later
// refusal as settlement of the unknown original in the other UI scenario.
test("A retained first refusal stays readable after reload and allows only a different invitation through the automatic handler", async () => {
  const root = new Element("div");
  const location = { origin: "https://page.test", hash: "#/invitation" };
  const membership = {
    kind: "membership" as const,
    scope: scopeIdOf({
      v: 1,
      kind: "membership",
      definition: "platform:membership@2",
      creator: null,
      cause: textDigest("refused UI membership"),
      ordinal: 0,
    }),
    inc: newIncarnation(new Uint8Array(16).fill(5)),
  };
  const place = {
    directory: scopeIdOf({
      v: 1,
      kind: "directory",
      definition: "platform:directory@2",
      creator: null,
      cause: textDigest("refused UI directory"),
      ordinal: 0,
    }),
    membership,
  };
  const key = keyIdOfSecret(new Uint8Array(32).fill(83));
  let phase: "refused" | "unknown" = "refused",
    posts = 0,
    checks = 0;
  const original = () => ({ status: phase, key, place, handle: "@ada" });
  const refused = () => ({
    ...original(),
    status: "refused",
    reason: "Refused because guard-failed.",
  });
  const sameInvitation = "artroom-invite:SCRIPTED refused invitation";
  const otherInvitation = "artroom-invite:SCRIPTED different invitation";
  const join = vi.fn(async (_origin: string, typed: string) => {
    if (phase === "unknown")
      return {
        ...original(),
        reason: "The original enrollment remains unknown.",
      };
    if (typed === sameInvitation) return refused();
    expect(typed).toBe(otherInvitation);
    posts++;
    phase = "unknown";
    return {
      ...original(),
      reason: "The different invitation remains unknown.",
    };
  });
  const check = vi.fn(async () => {
    checks++;
    return refused();
  });
  vi.doMock("../src/join-custody.ts", () => ({
    originalJoin: original,
    joinInvitation: join,
    checkOriginal: check,
  }));
  const view =
    await vi.importActual<typeof import("../src/view.ts")>("../src/view.ts");
  vi.doMock("../src/view.ts", () => ({
    ...view,
    icon: () => new Element("svg"),
    h: (
      tag: string,
      attrs: Record<string, string> = {},
      ...children: unknown[]
    ) => {
      const e = new Element(tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      e.children = children
        .flat()
        .filter((c) => c !== null && c !== undefined && c !== false) as (
        Element | string
      )[];
      return e;
    },
  }));
  vi.stubGlobal("document", {
    title: "",
    activeElement: null,
    getElementById: () => root,
  });
  vi.stubGlobal("location", location);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal("window", { addEventListener: vi.fn() });
  const drain = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  const field = () => root.all().find((e) => e.attrs["name"] === "invitation")!;
  try {
    await import("../src/main.ts");
    expect(field().hasAttribute("disabled")).toBe(false);
    expect(root.textContent).toContain("different invitation");
    expect(root.textContent).toContain("retained key");
    // Reload keeps the refusal and the same public identity, while leaving
    // the paste path available. Merely loading the page sends no enrollment.
    vi.resetModules();
    await import("../src/main.ts");
    expect(field().hasAttribute("disabled")).toBe(false);
    expect(posts).toBe(0);
    root
      .all()
      .find((e) => e.tag === "button" && e.textContent === "Check status")!
      .fire("click");
    await drain();
    expect(checks).toBe(1);
    expect(posts).toBe(0);
    field().value = sameInvitation;
    field().fire("input");
    await drain();
    expect(posts).toBe(0);
    expect(field().hasAttribute("disabled")).toBe(false);
    field().value = otherInvitation;
    field().fire("input");
    await drain();
    expect(posts).toBe(1);
    expect(join.mock.calls.map(([, typed]) => typed)).toEqual([
      sameInvitation,
      otherInvitation,
    ]);
    expect(original().key).toBe(key);
    expect(field().hasAttribute("disabled")).toBe(true);
    field().fire("input");
    await drain();
    expect(posts, "the new unknown request stays fenced").toBe(1);
    expect(
      root
        .all()
        .some((e) => e.attrs["name"] === "key" || e.attrs["name"] === "secret"),
    ).toBe(false);
  } finally {
    await drain();
    vi.unstubAllGlobals();
    vi.doUnmock("../src/join-custody.ts");
    vi.doUnmock("../src/view.ts");
    vi.resetModules();
  }
});
