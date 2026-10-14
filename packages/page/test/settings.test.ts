import { expect, test, vi } from "vitest";
import {
  b64url,
  keyIdOfSecret,
  newIncarnation,
  scopeIdOf,
  textDigest,
} from "@generalbusiness/artroom-bytes";

// Actual config entry handlers; DOM, native reads and storage failures are
// stand-ins. A readable config alone supplies no verified room membership.
test("Config and key select a room only after matching standing and exact storage readback; legacy Settings shows only the chooser", async () => {
  class Element {
    children: (Element | string)[] = [];
    attrs: Record<string, string> = {};
    value = "";
    className = "";
    parent: Element | null = null;
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
      for (const child of c) if (child instanceof Element) child.parent = this;
      this.children.unshift(...c);
    }
    append(...c: (Element | string)[]) {
      for (const child of c) if (child instanceof Element) child.parent = this;
      this.children.push(...c);
    }
    replaceChildren(...c: (Element | string)[]) {
      for (const child of this.children) if (child instanceof Element) child.parent = null;
      for (const child of c) if (child instanceof Element) child.parent = this;
      this.children = c;
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
      this.parent = null;
    }
    addEventListener(
      k: string,
      f: (event: { preventDefault(): void }) => void,
    ) {
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
  const root = new Element("div"),
    location = { origin: "https://page.test", hash: "#/settings" };
  let redraw!: () => void;
  const seed = new Uint8Array(32).fill(82),
    secret = b64url(seed);
  const membership = {
    kind: "membership" as const,
    scope: scopeIdOf({
      v: 1,
      kind: "membership",
      definition: "platform:membership@2",
      creator: null,
      cause: textDigest("config UI membership"),
      ordinal: 0,
    }),
    inc: newIncarnation(new Uint8Array(16).fill(4)),
  };
  const place = {
    directory: scopeIdOf({
      v: 1,
      kind: "directory",
      definition: "platform:directory@2",
      creator: null,
      cause: textDigest("config UI directory"),
      ordinal: 0,
    }),
    membership,
  };
  const config = JSON.stringify({
    service: "https://untrusted.invalid",
    repository: {
      directory: {
        scope: place.directory,
        kind: "directory",
        inc: membership.inc,
      },
      membership,
    },
  });
  let viewUnavailable = false;
  let mode: "missing-standing" | "verified" = "missing-standing",
    storageMode: "ok" | "drop" | "readback" = "ok",
    saved: string | null = null,
    readFails = false;
  const writes = vi.fn(),
    open = vi.fn(async (session: { service: string; secret: Uint8Array }) => ({
      session,
      directory: place.directory,
      membership,
      rules: place.directory,
      destination: place.directory,
      key: keyIdOfSecret(session.secret),
      name: "Studio",
      me:
        mode === "verified"
          ? {
              handle: "@ada",
              role: "member",
              actions: [],
              ref: { membership, member: "@ada" },
            }
          : null,
      reader: null,
      unsessioned: null,
      definitions: new Map(),
    }));
  const data =
    await vi.importActual<typeof import("../src/data.ts")>("../src/data.ts");
  vi.doMock("../src/data.ts", () => ({
    ...data,
    initializationStillCurrent: async () => true,
    roomInitialization: async () => ({ state: "configured" }),
    openRoom: open,
    listLanes: async () => {
      if (viewUnavailable) throw new Error("Scripted later view unavailable");
      return { issues: [], changes: [] };
    },
    actsOn: async () => ({ acts: [] }),
    actAssociation: () => "SCRIPTED-verified-room",
  }));
  const view =
    await vi.importActual<typeof import("../src/view.ts")>("../src/view.ts");
  vi.doMock("../src/view.ts", () => ({
    ...view,
    icon: () => new Element("svg"),
    actsPanel: () => new Element("section"),
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
    createElement: (tag: string) => new Element(tag),
    createElementNS: (_namespace: string, tag: string) => new Element(tag),
    getElementById: () => root,
  });
  vi.stubGlobal("location", location);
  vi.stubGlobal("window", {
    addEventListener: (_k: string, f: () => void) => {
      redraw = f;
    },
  });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => {
      if (k !== "artroom-page") return null;
      if (readFails) {
        readFails = false;
        throw new Error("Scripted readback failure");
      }
      return saved;
    },
    setItem: (k: string, v: string) => {
      if (k !== "artroom-page") return;
      writes(v);
      if (storageMode !== "drop") saved = v;
      if (storageMode === "readback") readFails = true;
    },
  });
  const drain = async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  };
  const fill = () => {
    root.all().find((e) => e.attrs["name"] === "config")!.value = config;
    root.all().find((e) => e.attrs["name"] === "key")!.value = secret;
  };
  const submit = () =>
    root
      .all()
      .find((e) => e.tag === "form")!
      .fire("submit");
  try {
    await import("../src/main.ts");
    expect(root.all().find(e => e.tag === "h1")?.textContent).toBe("Join or create a room");
    expect(root.textContent).not.toMatch(
      /Save settings|Create key|Your key|Issues|Changes|Rules/,
    );
    location.hash = "#/config";
    redraw();
    expect(
      root
        .all()
        .filter((e) => e.tag === "button")
        .map((e) => e.textContent),
    ).toEqual(["Join room"]);
    submit();
    await drain();
    expect(open).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    fill();
    submit();
    await drain();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]![0].service).toBe(location.origin);
    expect(writes).not.toHaveBeenCalled();
    expect(location.hash).toBe("#/config");
    mode = "verified";
    storageMode = "drop";
    submit();
    await drain();
    expect(saved).toBeNull();
    expect(location.hash).toBe("#/config");
    expect(root.textContent).toContain("storage could not be read back");
    storageMode = "readback";
    submit();
    await drain();
    expect(JSON.parse(saved!)).toEqual({ place, secret });
    expect(location.hash).toBe("#/config");
    expect(root.textContent).toContain("Check the original saved connection");
    storageMode = "ok";
    // The earlier write changed the saved context despite failed readback.
    // Its old handler must stay fenced. Reopen the chooser's config path.
    location.hash = "#/join";
    redraw();
    location.hash = "#/config";
    redraw();
    fill();
    submit();
    await drain();
    expect(location.hash).toBe("#/");
    expect(
      open.mock.calls.every(([session]) => session.service === location.origin),
    ).toBe(true);
    expect(JSON.parse(saved!)).toEqual({ place, secret });
    expect(document.title).toBe("dap - workroom Studio");
    expect(root.all().some((e) => e.attrs["class"] === "rail")).toBe(true);
    viewUnavailable = true;
    redraw();
    await drain();
    expect(root.textContent).toContain("Observation unknown");
    expect(
      root
        .all()
        .some(
          (e) =>
            e.attrs["class"] === "rail" || e.attrs["class"] === "mobile-header",
        ),
    ).toBe(false);
    expect(document.title).toBe("dap - workroom");
  } finally {
    await drain();
    vi.unstubAllGlobals();
    vi.doUnmock("../src/data.ts");
    vi.doUnmock("../src/view.ts");
    vi.resetModules();
  }
});
