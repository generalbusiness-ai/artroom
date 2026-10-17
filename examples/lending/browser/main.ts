/**
 * The lending library's member interface. Requirements: section 6 of
 * notes/2026-10-13-lending-library.md. Every word a member typed is put on the
 * page as text, never as markup.
 *
 * Each act keeps its page text in the signed request. Published text is read separately.
 */
import "./style.css";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import type { Entry } from "@generalbusiness/dap-contract";
import { lendingGateway, type ActOutcome, type LendingGateway, type LendingState, type Pending } from "./client.ts";
import { deviceSigner, findLending, joining, newDeviceKey, readInvitation, type DeviceKey, type JoinOutcome, type Seat } from "./join.ts";
import { offeredActs, journalRows, type LendingAct, type LendingView, type ShownThing } from "./model.ts";
import { shelfPage } from "../shelf.ts";
import { readPage, type PublishedPage } from "./publication.ts";
import { actStore, browserLock, joinStore, remembered, type Remembered } from "./storage.ts";

type Notice = { kind: "plain" | "refusal"; text: string } | null;
const root = document.querySelector<HTMLElement>("#lending")!;
/** Each change of room or view raises this, so an answer for a view the person has left is ignored. */
let epoch = 0, reading = 0;
let memory: Remembered | null = null, gateway: LendingGateway | null = null, state: LendingState = { status: "loading" };
let kept: Pending | null = null, keptJoin: Seat | null = null, notice: Notice = null, busy = false, timer: number | undefined;
/** Controls whose typed text a redraw must drop: a donation that took effect empties its form. */
const dropped = new Set<string>();
/** Keep a staff member's draft while a permission refresh temporarily hides its control. */
const reasonDrafts = new Map<string, string>();
let drawnEpoch = epoch;
let published = new Map<number, PublishedPage>(), pageRead: AbortController | null = null;
async function pages(view: LendingView, version: number, at: number): Promise<void> {
  pageRead?.abort(); const controller = new AbortController(); pageRead = controller;
  published = new Map();
  const identity=memory?.identity, directory=memory?.seat?.directory.scope;
  if(!identity || !directory) return;
  const rows=await Promise.all(view.things.map(async thing => [thing.id,await readPage(identity.origin,directory,thing,view.record,controller.signal)] as const));
  if(at!==epoch || version!==reading || controller.signal.aborted) return;
  published=new Map(rows); draw();
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.append(...children);
  return element;
}
const button = (label: string, act: () => void, plain = false): HTMLButtonElement => {
  const element = h("button", { type: "button", ...(plain ? { class: "plain" } : {}) }, label);
  element.disabled = busy;
  element.addEventListener("click", act);
  return element;
};
const field = (label: string, control: HTMLInputElement | HTMLTextAreaElement): HTMLLabelElement => h("label", {}, label, control);

async function work(task: () => Promise<void>): Promise<void> {
  if (busy) return;
  const at = epoch;
  busy = true; draw();
  try { await task(); } catch (error) { if (at === epoch) notice = { kind: "plain", text: error instanceof Error ? error.message : "Something went wrong. Nothing was sent." }; }
  finally { if (at === epoch) { busy = false; draw(); } }
}

async function look(): Promise<void> {
  const at = epoch, version = ++reading, using = gateway;
  if (!using) return;
  // A new permission read hides Cancel immediately, including while it is still loading.
  if (state.status === "current") state = { ...state, actions: null };
  draw();
  const [next, pending] = [await using.look(), await using.pending()];
  if (at !== epoch || version !== reading || using !== gateway) return;
  state = next; kept = pending; published = new Map(); draw();
  if(next.status === "current") void pages(next.view,version,at);
}
function tell(kind: LendingAct | "kept", outcome: ActOutcome | null): void {
  if (outcome === null) { notice = null; return; }
  notice = outcome.status === "recorded" ? { kind: "plain", text: kind === "kept" ? "The kept request took effect." : `Done: ${kind} took effect.` }
    : outcome.status === "refused" ? { kind: "refusal", text: outcome.reason }
      : { kind: "plain", text: outcome.reason };
}
const act = (kind: LendingAct, input: { thing?: number; name?: string; description?: string; reason?: string }) => work(async () => {
  const at = epoch, using = gateway;
  if (!using) return;
  const outcome = await using.act(kind, input);
  if (at !== epoch) return;
  tell(kind, outcome);
  if (outcome.status === "recorded") {
    const consumed = kind === "donate" ? ["donate-name", "donate-description"] : kind === "cancel" ? [`reason-${input.thing}`] : [];
    for (const key of consumed) dropped.add(key);
  }
  await look();
});

async function open(next: Remembered): Promise<void> {
  reasonDrafts.clear();
  epoch++; reading++; pageRead?.abort(); published = new Map(); busy = false; gateway?.dispose(); gateway = null; state = { status: "loading" }; kept = null;
  memory = next; draw();
  if (timer !== undefined) clearInterval(timer);
  if (!next.identity) return;
  const at = epoch;
  gateway = lendingGateway(next.identity, deviceSigner(next.device), { current: () => at === epoch, lock: browserLock, store: actStore(next.identity) });
  await look();
  if (at !== epoch) return;
  timer = window.setInterval(() => { if (!busy && document.visibilityState === "visible") void look(); }, 15_000);
}
/** Public context only; the nonextractable key pair never enters this comparison. */
const rememberedContext = (value: Remembered | null) => value === null ? null : canonicalize({ key: value.device.publicKey, seat: value.seat ?? null, identity: value.identity ?? null });
async function seated(device: DeviceKey, seat: Seat, expectedEpoch = epoch): Promise<void> {
  const previous = rememberedContext(memory ?? { v: 1, device });
  const matched = await findLending(seat, device);
  if (expectedEpoch !== epoch) return;
  await browserLock.run(async () => {
    if (expectedEpoch !== epoch) return;
    const stored = await remembered.load();
    if (expectedEpoch !== epoch || rememberedContext(stored) !== previous || stored?.device.publicKey !== device.publicKey) return;
    const next: Remembered = { v: 1, device, seat, ...(matched.ok ? { identity: matched.identity } : {}) };
    await remembered.save(next);
    if (expectedEpoch !== epoch) return;
    if (!matched.ok) notice = { kind: "plain", text: matched.reason };
    // Every remembered writer takes this lock. Open the committed context before releasing it.
    await open(next);
  });
}
function joined(device: DeviceKey, outcome: JoinOutcome | null, expectedEpoch = epoch): Promise<void> | void {
  if (expectedEpoch !== epoch) return;
  if (outcome === null) return;
  if (outcome.status === "joined") { notice = { kind: "plain", text: `You joined as ${outcome.seat.handle}.` }; keptJoin = null; return seated(device, outcome.seat, expectedEpoch); }
  notice = { kind: outcome.status === "refused" ? "refusal" : "plain", text: outcome.reason };
  if (outcome.status === "refused") keptJoin = null;
  if (outcome.status === "unknown" && outcome.seat) keptJoin = outcome.seat;
}
function joinFor(device: DeviceKey, expectedEpoch = epoch) {
  return joining(device, { lock: browserLock, store: joinStore, current: () => expectedEpoch === epoch });
}
/** The device key of this browser, made on first need and remembered before it is used. */
async function device(): Promise<DeviceKey> {
  const at = epoch;
  return browserLock.run(async () => {
    if (at !== epoch) throw new Error("This device context is no longer current.");
    if (memory) return memory.device;
    const existing = await remembered.load();
    if (at !== epoch) throw new Error("This device context is no longer current.");
    if (existing) { memory = existing; return existing.device; }
    const made: Remembered = { v: 1, device: await newDeviceKey() };
    if (at !== epoch) throw new Error("This device context is no longer current.");
    await remembered.save(made);
    if (at !== epoch) throw new Error("This device context is no longer current.");
    memory = made;
    return made.device;
  });
}

function drawJoin(): Node[] {
  const link = h("textarea", { "data-key": "invite", "aria-label": "Invitation link", placeholder: "artroom-invite:…" });
  if (location.hash.startsWith("#artroom-invite:")) link.value = location.hash.slice(1);
  const nodes: Node[] = [h("p", { class: "eyebrow" }, "Lending library"), h("h1", {}, "Join the library"),
    h("p", {}, "To borrow, return or donate, you need a seat in this room. Paste the invitation link you were given.")];
  if (keptJoin) nodes.push(h("div", { class: "notice kept" }, h("p", {}, `A join as ${keptJoin.handle} was sent and no answer came back. It is kept in this browser. Check reads its outcome; Continue sends that same join.`),
    button("Check the join", () => void work(async () => { const at = epoch, key = await device(); if (at !== epoch) return; await joined(key, await joinFor(key, at).check(), at); })),
    button("Continue the join", () => void work(async () => { const at = epoch, key = await device(); if (at !== epoch) return; await joined(key, await joinFor(key, at).continueOriginal(), at); }))));
  else nodes.push(field("Invitation link", link), button("Join", () => void work(async () => {
    const invited = readInvitation(link.value, location.origin);
    if (!invited.ok) { notice = { kind: "plain", text: `${invited.reason} Nothing was sent.` }; return; }
    const at = epoch, key = await device();
    if (at !== epoch) return;
    await joined(key, await joinFor(key, at).join(invited.link, invited.seat), at);
    if (location.hash) history.replaceState(null, "", location.pathname);
  })));
  nodes.push(h("p", { class: "muted" }, "This browser makes a key for you and keeps it. The key cannot be copied out of this browser."));
  return nodes;
}

function drawKept(): Node | null {
  if (!kept || !gateway) return null;
  const using = gateway, what = kept.name ? `${kept.kind} “${kept.name}”` : kept.thing === null ? kept.kind : `${kept.kind} of thing ${kept.thing}`;
  const settle = (ask: () => Promise<ActOutcome | null>) => () => void work(async () => { const at = epoch; const outcome = await ask(); if (at !== epoch) return; tell("kept", outcome); await look(); });
  const box = h("div", { class: "notice kept" }, h("p", {}, `An earlier request is kept in this browser: ${what}. ${kept.unsent ? "It was not sent." : "It may have been sent. Continue sends only that same request."}`),
    h("div", { class: "row" }, button("Check", settle(() => using.check())), button("Continue", settle(() => using.continueOriginal()), true),
      button("Give up", () => void work(async () => { const at = epoch, gone = await using.abandon(); if (at !== epoch || using !== gateway) return; notice = { kind: "plain", text: gone ? "The kept request did not take effect and was given up." : "It cannot be given up yet: it may still take effect, or it already did. Check it." }; await look(); }), true)));
  return box;
}

function drawThing(thing: ShownThing, view: LendingView): Node {
  const status = thing.state === "available" ? "Available" : thing.state === "lent" ? `Lent to ${thing.borrower ?? "a member"}` : `Gone: ${thing.reason ?? ""}`;
  const card = h("div", { class: `panel thing ${thing.state}` }, h("h3", {}, thing.name || `Thing ${thing.id}`), h("p", {}, thing.description),
    h("p", { class: `state ${thing.state}` }, status), h("p", { class: "muted" }, `Donated by ${thing.donor}`));
  const acts = offeredActs(thing, state.status === "current" ? state.actions : null), row = h("div", { class: "row" });
  if (acts.includes("borrow")) row.append(button("Borrow", () => void act("borrow", { thing: thing.id })));
  if (acts.includes("return")) row.append(button("Return", () => void act("return", { thing: thing.id })));
  if (acts.includes("cancel")) {
    const reason = h("input", { type: "text", "data-key": `reason-${thing.id}`, "aria-label": `Why thing ${thing.id} is gone`, placeholder: "Why it is gone (staff only)" });
    row.append(reason, button("Cancel this thing", () => void act("cancel", { thing: thing.id, reason: reason.value }), true));
  }
  const page = published.get(thing.id);
  if (acts.includes("publish") && page?.status !== "matches") row.append(button("Publish this page", () => void act("publish", { thing: thing.id }), true));
  if (acts.length) card.append(row);
  card.append(h("p", {class:"muted"}, page?.status === "matches" ? "Published page text matches this thing at the observed commit." : page?.status === "differs" ? "The published page text differs. Publish this page to refresh it." : page?.status === "unreadable" ? page.reason : "Reading the published page…"));
  if(page && page.status !== "unreadable") card.append(h("p", {}, h("a",{href:page.url},`Read page at commit ${page.commit}`)));
  card.append(h("details", {}, h("summary", {}, `Shelf page ${thing.page}`), h("pre", {}, shelfPage(thing, view.record))));
  return card;
}

function drawRecord(entries: readonly Entry[]): Node {
  const body = h("tbody");
  for (const row of journalRows(entries)) {
    const what = h("td");
    what.textContent = row.what;
    body.append(h("tr", {}, h("td", {}, String(row.seq)), h("td", {}, row.kind), h("td", {}, row.signer), what));
  }
  return h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Entry"), h("th", {}, "Act"), h("th", {}, "Signed by"), h("th", {}, "What"))), body);
}

function drawLibrary(seat: Seat): Node[] {
  const nodes: Node[] = [h("p", { class: "eyebrow" }, "Lending library"), h("h1", {}, "The shelf"), h("p", { class: "muted" }, `You are ${seat.handle}.`)];
  const view = state.status === "loading" ? undefined : state.view;
  if (state.status === "loading") nodes.push(h("p", {}, "Reading the library…"));
  if (state.status === "behind") nodes.push(h("div", { class: "notice" }, h("p", {}, `This list may be behind the library: ${state.reason}`), button("Look again", () => void work(look), true)));
  const keptBox = drawKept();
  if (keptBox) nodes.push(keptBox);
  if (!view) return nodes;
  const name = h("input", { type: "text", "data-key": "donate-name", maxlength: "80" }), description = h("textarea", { "data-key": "donate-description", maxlength: "1000" });
  nodes.push(h("h2", {}, "Donate a thing"), h("div", { class: "panel" }, field("Name", name), field("Description", description),
    button("Donate", () => void act("donate", { name: name.value, description: description.value }))));
  const live = view.things.filter((thing) => thing.state !== "gone"), gone = view.things.filter((thing) => thing.state === "gone");
  nodes.push(h("h2", {}, `On the shelf (${live.length})`), ...(live.length ? live.map((thing) => drawThing(thing, view)) : [h("p", { class: "muted" }, "The shelf is empty. Donate the first thing.")]));
  if (gone.length) nodes.push(h("h2", {}, `Gone (${gone.length})`), ...gone.map((thing) => drawThing(thing, view)));
  nodes.push(h("h2", {}, "The published shelf"), h("p", {}, h("a", { href: `/site/${encodeURIComponent(seat.directory.scope)}/HEAD/shelf/` }, "Open the published shelf"),
    ". It is public. A page there can be behind this list."));
  if (state.status === "current") nodes.push(h("h2", {}, "The record (for members)"),
    h("p", { class: "muted" }, `Every act that took effect, in order, up to entry ${view.record.seq}. A refused act is not in it.`), drawRecord(state.entries));
  nodes.push(h("p", {}, button("Look again", () => void work(look), true), " ", button("Forget this browser's seat", () => void work(async () => {
    if (kept || keptJoin) { notice = { kind: "plain", text: "A request is kept. Check it before forgetting this seat." }; return; }
    const at = epoch, previous = rememberedContext(memory);
    await browserLock.run(async () => {
      if (at !== epoch || rememberedContext(await remembered.load()) !== previous) return;
      if (at !== epoch) return;
      await remembered.forget();
      if (at !== epoch) return;
      reasonDrafts.clear(); epoch++; reading++; pageRead?.abort(); published = new Map(); busy = false; gateway?.dispose(); gateway = null; memory = null;
      notice = { kind: "plain", text: "This browser's key and seat are forgotten. The room still has the seat." }; draw();
    });
  }), true)));
  return nodes;
}

function draw(): void {
  const controls = () => [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-key]")];
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement.getAttribute("data-key") : null;
  const typed = new Map(controls().map((control) => [control.dataset["key"]!, control.value]));
  if (drawnEpoch !== epoch) {
    reasonDrafts.clear();
    for (const key of typed.keys()) if (key.startsWith("reason-")) typed.delete(key);
    drawnEpoch = epoch;
  }
  for (const [key, value] of typed) if (key.startsWith("reason-")) reasonDrafts.set(key, value);
  for (const key of dropped) { typed.delete(key); reasonDrafts.delete(key); }
  for (const [key, value] of reasonDrafts) if (!typed.has(key)) typed.set(key, value);
  dropped.clear();
  const nodes = memory?.seat && memory.identity ? drawLibrary(memory.seat) : drawJoin();
  if (memory?.seat && !memory.identity) nodes.push(button("Look for the library again", () => void work(() => seated(memory!.device, memory!.seat!)), true));
  const said = h("div", { role: "status", "aria-live": "polite" });
  if (notice) said.append(h("div", { class: `notice${notice.kind === "refusal" ? " refusal" : ""}` }, notice.text));
  root.replaceChildren(nodes[0]!, nodes[1]!, said, ...nodes.slice(2));
  // A redraw keeps what the person was typing.
  for (const control of controls()) { const value = typed.get(control.dataset["key"]!); if (value !== undefined && !control.value) control.value = value; }
  if (focused) controls().find((control) => control.dataset["key"] === focused)?.focus();
}

void (async () => {
  try {
    memory = await remembered.load();
    if (memory) { keptJoin = await joining(memory.device, { lock: browserLock, store: joinStore }).pending(); if (memory.seat) await open(memory); }
  } catch (error) { notice = { kind: "plain", text: error instanceof Error ? error.message : "This browser's private storage is unavailable." }; }
  draw();
})();
