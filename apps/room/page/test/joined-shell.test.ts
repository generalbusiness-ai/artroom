import { expect, test, vi } from "vitest";
import { b64url, keyIdOfSecret } from "@generalbusiness/artroom-bytes";

// Production Main/view markup and handlers over scripted data/DOM ports.
// The DOM stand-in models native details/anchor clicks; it proves no browser
// layout or native membership admission. Those require separate witnesses.
test("joined room/account clicks disclose identity without leaving the room, and connected Join has a named back link", async () => {
  vi.resetModules();
  const location = { origin: "https://page.test", hash: "#/" };
  class Element {
    attrs: Record<string, string> = {};
    children: (Element | string)[] = [];
    parent: Element | null = null;
    handlers = new Map<string, (event: { preventDefault(): void }) => void>();
    constructor(readonly tag: string) {}
    setAttribute(k: string, v: string) { this.attrs[k] = v; }
    getAttribute(k: string) { return this.attrs[k] ?? null; }
    hasAttribute(k: string) { return Object.hasOwn(this.attrs, k); }
    removeAttribute(k: string) { delete this.attrs[k]; }
    append(...children: (Element | string)[]) { for (const c of children) { if (c instanceof Element) c.parent = this; this.children.push(c); } }
    prepend(...children: (Element | string)[]) { this.children.unshift(...children); }
    replaceChildren(...children: (Element | string)[]) { this.children = []; this.append(...children); }
    addEventListener(k: string, f: (event: { preventDefault(): void }) => void) { this.handlers.set(k, f); }
    click() {
      let prevented = false;
      this.handlers.get("click")?.({ preventDefault() { prevented = true; } });
      if (!prevented && this.tag === "summary" && this.parent?.tag === "details") {
        if (this.parent.hasAttribute("open")) this.parent.removeAttribute("open"); else this.parent.setAttribute("open", "");
      }
      if (!prevented && this.tag === "a" && this.attrs["href"]?.startsWith("#")) location.hash = this.attrs["href"];
    }
    get value() { return this.attrs["value"] ?? ""; }
    set value(value: string) { this.attrs["value"] = value; }
    focus() {}
    all(): Element[] { return [this, ...this.children.flatMap(c => c instanceof Element ? c.all() : [])]; }
    contains(node: Element) { return this.all().includes(node); }
    querySelectorAll(selector: string) { return this.all().slice(1).filter(node => selector === "details.shell-disclosure" ? node.tag === "details" && (node.attrs["class"] ?? "").split(" ").includes("shell-disclosure") : node.tag === selector); }
    querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
    get textContent(): string { return this.children.map(c => typeof c === "string" ? c : c.textContent).join(" "); }
  }
  const root = new Element("div"), secret = new Uint8Array(32).fill(71);
  const place = { directory: "directory", membership: { scope: "membership", kind: "membership", inc: "one" } };
  const room = { session: { service: location.origin, secret }, ...place, name: "Hugh's room", key: keyIdOfSecret(secret), me: { handle: "@hugh-web", role: "member", actions: [] }, reader: {}, rules: "rules", destination: "destination" };
  const saved = JSON.stringify({ place, secret: b64url(secret) });
  const setItem = vi.fn();
  vi.doMock("../src/data.ts", async () => ({
    ...await vi.importActual<typeof import("../src/data.ts")>("../src/data.ts"),
    roomInitialization: async () => ({ state: "configured" }), initializationStillCurrent: async () => true,
    openRoom: async () => room, actsOn: async () => ({ acts: [], hidden: 0 }), listLanes: async () => ({ issues: [], changes: [] }), siteAddress: () => "/site/HEAD/",
  }));
  vi.stubGlobal("document", { title: "", activeElement: null, getElementById: () => root, createElement: (tag: string) => new Element(tag), createElementNS: (_ns: string, tag: string) => new Element(tag) });
  vi.stubGlobal("location", location);
  vi.stubGlobal("localStorage", { getItem: (key: string) => key === "artroom-page" ? saved : null, setItem });
  let redraw!: () => void;
  vi.stubGlobal("window", { addEventListener: (_name: string, handler: () => void) => { redraw = handler; } });
  const drain = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
  try {
    await import("../src/main.ts"); await drain();
    const controls = root.all().filter(e => ["room-switch", "account"].includes(e.attrs["class"] ?? ""));
    expect(controls).toHaveLength(4); // Desktop and mobile presentations.
    let prior: Element | null = null;
    for (const control of controls) {
      expect(control.tag).toBe("summary"); expect(control.hasAttribute("href")).toBe(false);
      control.click(); expect(location.hash).toBe("#/"); expect(control.parent?.hasAttribute("open")).toBe(true);
      if (prior) expect(prior.hasAttribute("open")).toBe(false);
      prior = control.parent;
      expect(root.all().filter(node => node.tag === "details" && node.hasAttribute("open"))).toHaveLength(1);
    }
    root.handlers.get("click")!({ target: root } as never);
    expect(root.all().filter(node => node.tag === "details" && node.hasAttribute("open"))).toHaveLength(0);
    expect(root.all().filter(e => e.attrs["class"] === "avatar").map(e => e.textContent)).toEqual(["H", "H"]);
    expect(root.all().filter(e => e.attrs["class"] === "account-label").map(e => e.textContent)).toEqual(["@hugh-web", "@hugh-web"]);
    const roomDisclosure = controls.find(e => e.attrs["class"] === "room-switch")!.parent!;
    expect(roomDisclosure.all().find(e => e.tag === "p")?.attrs["title"]).toBe(room.directory);
    const accountDisclosure = controls.find(e => e.attrs["class"] === "account")!.parent!;
    expect(accountDisclosure.textContent).toContain("@hugh-web (member)"); expect(accountDisclosure.textContent).toContain(room.key);
    for (const label of ["Join another room", "Change connection"]) {
      const link = root.all().find(e => e.tag === "a" && e.textContent === label)!;
      expect(link.attrs["href"]).toBe("#/join");
    }
    roomDisclosure.all().find(e => e.tag === "a")!.click(); expect(location.hash).toBe("#/join"); redraw(); await drain();
    expect(root.all().find(e => e.tag === "h1")?.textContent).toBe("Join another room");
    expect(root.all().filter(e => e.attrs["class"] === "entry-intro")).toHaveLength(0);
    const back = root.all().find(e => e.tag === "a" && e.textContent.includes("Back to Hugh's room"))!;
    expect(back.attrs["href"]).toBe("#/");
    expect(root.all().filter(e => e.attrs["class"] === "entry-choice").map(e => [e.attrs["href"], e.all().find(child => child.tag === "h2")?.textContent, e.all().find(child => child.tag === "p")?.textContent])).toEqual([
      ["#/start", "Create a new room", "Start a new room for shared work"],
      ["#/invitation", "Join with an invitation link", "Paste a link. We create your key and join the room."],
      ["#/config", "Join with a config and key", "Use config.json and its matching device key."],
    ]);
    back.click(); expect(location.hash).toBe("#/");
    expect(setItem).not.toHaveBeenCalled(); expect(root.textContent).not.toContain("Settings");
  } finally { await drain(); vi.unstubAllGlobals(); vi.doUnmock("../src/data.ts"); vi.resetModules(); }
});
