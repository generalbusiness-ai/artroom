/** One loaded-Page text proposal task. No automatic merge, durable outbox or replacement signature. */
import type { Answer, Beside, DeclaredDefinition, Digest, FactRef, FieldValue, Grant, Head, ScopeId, ScopeRef, Seed, SignedIntent, Summary } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest, digestBytes, entryHash, scopeIdOf, utf8, verifySignedIntent, wellFormed } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, declaredHandle, httpTransport, secretSigner, shapeDeclaredAct, signedIntent, signedReads } from "@generalbusiness/artroom-client";
import { expectedOf, heldActs, type DefinitionShape } from "@generalbusiness/artroom-cli";
import { editPath, fileSound, platform } from "@generalbusiness/artroom-platform";
import { actAssociation, openRoom, Unreadable, type ChangeView, type Room } from "./data.ts";

export interface EditSource { scope: ScopeRef; manifest: number; opened: Digest; base: string; path: string; digest: Digest; size: number; content: string }
export interface EditDraft { title: string; path: string; content: string }
export interface EditStep { kind: "open-pr" | "ask-rules" | "propose-file"; target: ScopeRef; signed: SignedIntent; grants: readonly Grant[]; beside: Beside; attempted: boolean; answer?: Answer; receiptVerified?: boolean }
export interface EditTask {
  association: string; source: EditSource; draft: Readonly<EditDraft>; base: string; definition: Digest; definitionBytes: string; declared: DeclaredDefinition;
  steps: EditStep[]; lane?: ScopeId; proposal?: number; version?: FactRef; directory: ScopeRef;
  state: "prepared" | "waiting-lane" | "waiting-rules" | "unknown" | "refused" | "recorded" | "stopped";
  message: string; busy: boolean;
}
export interface EditOptions { current(): boolean; changed?(): void; pause?(scopes: readonly string[]): Promise<void> }
const handle = (room: Room, scope: ScopeId) => new ScopeHandle(signedReads(httpTransport(room.session.service, room.session.fetch ? { fetch: room.session.fetch } : {}), secretSigner(room.session.secret), room.session.now ? { now: room.session.now } : {}), scope, room.reader?.reader() ?? null);
async function summary(h: ScopeHandle): Promise<{ value: Summary; at: Head }> { const r = await h.summary(); if (!r.ok) throw new Unreadable(`Cannot read ${h.scope}: ${r.reason}.`); if (!r.complete || r.next !== undefined) throw new Unreadable(`Incomplete read of ${h.scope}.`); return { value: r.value, at: r.at }; }
function freeze<T>(value: T): T { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
const check = (options: EditOptions) => { if (!options.current()) throw new Unreadable("The room or key changed. Nothing new was sent; return to the original task."); };
export function editFields(draft: EditDraft, base: string): Record<string, FieldValue> {
  if (!wellFormed(draft.content) || draft.content.includes("\0")) throw new Unreadable("Only well-formed UTF-8 text without NUL is supported.");
  const bytes = utf8(draft.content);
  if (bytes.length > 65536) throw new Unreadable("One text file may contain at most 65,536 UTF-8 bytes.");
  if (editPath(draft.path) === null) throw new Unreadable("Choose a relative path inside the room, at most 1,024 UTF-8 bytes.");
  if (!wellFormed(draft.title) || !draft.title.trim() || utf8(draft.title).length > 256) throw new Unreadable("Give the proposal a title of at most 256 UTF-8 bytes.");
  return { base, path: draft.path, content: draft.content, size: bytes.length, digest: digestBytes(bytes) };
}

/** Authenticate the original retained entry, not the current Git branch or rendered HTML. */
export async function readEditSource(room: Room, change: ChangeView, manifest: number): Promise<EditSource> {
  const h = handle(room, change.scope); const s = await summary(h);
  const selected = change.manifests.find(i => i.id === manifest);
  const item = s.value.items.find(i => i.type === "manifest" && i.id === manifest);
  if (!selected?.file || typeof selected.file.content !== "string" || !item || selected.file.path !== item.values["path"] || selected.file.digest !== item.values["digest"] || selected.file.size !== item.values["size"] || selected.base !== item.values["base"]) throw new Unreadable("The selected source changed or is unavailable. Choose it again explicitly.");
  const r = await h.entry(manifest);
  if (!r.ok || !r.complete || r.next !== undefined) throw new Unreadable("The selected source entry could not be read completely.");
  const { entry, hash } = r.value; const input = entry.input;
  if (entry.seq !== manifest || canonicalize(entry.at) !== canonicalize(s.value.scope) || entryHash(entry) !== hash || item.opened !== hash || !entry.effects.some(e => e.effect === "open" && e.type === "manifest" && e.item === manifest)
    || input.type !== "act" || input.signed.intent.kind !== "propose-file" || !verifySignedIntent(input.signed) || canonicalize(input.signed.intent.to) !== canonicalize(s.value.scope)) throw new Unreadable("The selected source identity could not be verified.");
  const author = input.authority.length === 1 ? input.authority[0] : null;
  if (!author || author.key !== input.signed.intent.actor || canonicalize(author.subject) !== canonicalize(item.parties["integrator"]) || !Array.isArray(item.parties["authors"]) || !item.parties["authors"].some(m => canonicalize(m) === canonicalize(author.subject))) throw new Unreadable("The source author binding could not be verified.");
  const { base, path, digest, size, content } = input.signed.intent.fields;
  if (typeof base !== "string" || typeof path !== "string" || typeof digest !== "string" || typeof size !== "number" || typeof content !== "string" || path !== item.values["path"] || digest !== item.values["digest"] || size !== item.values["size"] || base !== item.values["base"] || content !== selected.file.content || !fileSound({ path, digest, size, content })) throw new Unreadable("The retained source bytes do not match this version.");
  return { scope: s.value.scope, manifest, opened: hash, base, path, digest: digest as Digest, size, content };
}

function supports(declared: DeclaredDefinition, fields: Record<string, FieldValue>): boolean {
  try {
    const ask = declared.acts["ask-rules"], file = declared.acts["propose-file"];
    if (declared.name !== "change" || !ask || ask.step !== "transition" || ask.on !== "proposal" || !file || file.step !== "open" || file.on !== "manifest") return false;
    if (file.fields["base"]?.type !== "commit" || file.fields["digest"]?.type !== "digest" || file.fields["size"]?.type !== "int" || file.fields["path"]?.type !== "text" || file.fields["path"].detached || file.fields["content"]?.type !== "text" || file.fields["content"].detached) return false;
    shapeDeclaredAct(declared, "ask-rules", { on: 0, fields: {} }); shapeDeclaredAct(declared, "propose-file", { on: null, fields });
    const expected = [{ party: { slot: "integrator", from: { signer: true } } }, { party: { slot: "authors", from: [{ signer: true }] } }, ...["base", "path", "digest", "size"].map(slot => ({ value: { slot, from: { field: slot } } })), { value: { slot: "complete", from: { const: true } } }];
    const requests = ask.sends.filter(s => "tell" in s && s.tell.message === "rules-wanted");
    return requests.length === 1 && expected.every(wanted => file.effects.filter(e => (e.of === undefined || e.of === "on") && ("party" in wanted ? "party" in e && e.party.slot === wanted.party.slot : "value" in e && e.value.slot === wanted.value.slot)).length === 1 && file.effects.some(e => canonicalize(e) === canonicalize(wanted)))
      && ask.sends.some(s => "tell" in s && s.tell.message === "rules-wanted" && !s.tell.if && canonicalize(s.tell.to) === canonicalize({ slot: "rulesScope", of: "on" }));
  } catch { return false; }
}
async function currentRoom(room: Room, options: EditOptions): Promise<Room> { check(options); const fresh = await openRoom(room.session, { directory: room.directory, membership: room.membership }); check(options); if (fresh.rules !== room.rules || fresh.destination !== room.destination || fresh.me?.handle !== room.me?.handle || fresh.key !== room.key) throw new Unreadable("The room identity changed. Nothing new was sent."); return fresh; }
async function head(room: Room): Promise<string> { const s = await summary(handle(room, room.destination)); if (!["platform:destination@2", "platform:destination@3"].includes(s.value.definition)) throw new Unreadable("This destination does not support the one-file text workflow."); const h = s.value.items.find(i => i.type === "branch")?.values["head"]; if (typeof h !== "string") throw new Unreadable("The room has no recorded published head."); return h; }
export async function prepareEdit(room: Room, change: ChangeView, manifest: number, draft: EditDraft, options: EditOptions): Promise<EditTask> {
  const captured = Object.freeze({ ...draft });
  editFields(captured, "0".repeat(40)); const fresh = await currentRoom(room, options);
  if (!fresh.me?.actions.includes("change.open") || !fresh.me.actions.includes("change.propose")) throw new Unreadable("Your current member does not hold permission to open and propose a change.");
  const source = await readEditSource(fresh, change, manifest); check(options);
  const R = handle(fresh, fresh.rules); const rs = await summary(R);
  const active = rs.value.items.filter(i => i.type === "definition" && i.state === "active" && i.values["name"] === "change").sort((a,b) => b.id-a.id)[0];
  const digest = active?.values["digest"]; if (typeof digest !== "string") throw new Unreadable("No change definition is active.");
  const kept = await signedReads(httpTransport(fresh.session.service, fresh.session.fetch ? { fetch: fresh.session.fetch } : {}), secretSigner(fresh.session.secret), fresh.session.now ? { now: fresh.session.now } : {}).retained(fresh.rules, fresh.reader?.reader() ?? null, "definition", digest as Digest); if (!kept.ok) throw new Unreadable("The active change definition could not be read.");
  const declared = JSON.parse(kept.value.bytes) as DeclaredDefinition; if (canonicalize(declared) !== kept.value.bytes || definitionDigest(declared) !== digest) throw new Unreadable("The active definition bytes do not match their digest.");
  const base = await head(fresh); check(options); if (!supports(declared, editFields(captured, base))) throw new Unreadable("The active change definition does not support this bounded text workflow.");
  const D = await summary(handle(fresh, fresh.directory));
  const directoryShape = platform(D.value.definition)?.data as unknown as DefinitionShape | undefined;
  if (!directoryShape || !heldActs(directoryShape, fresh.me).acts.some(([kind]) => kind === "open-pr")) throw new Unreadable("The directory does not offer the supported native change opening.");
  shapeDeclaredAct(platform(D.value.definition)!.data as unknown as DeclaredDefinition, "open-pr", { on: null, fields: { definition: digest, title: captured.title, draft: false, body: "Source reference" } } as never);
  return { association: actAssociation(room, change.scope), source, draft: captured, base, definition: digest as Digest, definitionBytes: kept.value.bytes, declared, directory: D.value.scope, steps: [], state: "prepared", message: "Current file comparison is unavailable. This proposal writes the target on the named published base; it may overwrite existing content and leaves the old path unchanged.", busy: false };
}

async function taskRoom(room: Room, task: EditTask, options: EditOptions): Promise<Room> {
  if (task.association !== actAssociation(room, task.source.scope.scope)) throw new Unreadable("This task belongs to another room/member/key context.");
  const fresh = await currentRoom(room, options);
  const directory = await summary(handle(fresh, fresh.directory)); check(options);
  if (canonicalize(directory.value.scope) !== canonicalize(task.directory)) throw new Unreadable("The original directory incarnation changed. Nothing new was sent.");
  const rules = await summary(handle(fresh, fresh.rules)); check(options);
  if (!rules.value.items.some(item => item.type === "definition" && item.state === "active" && item.values["name"] === "change" && item.values["digest"] === task.definition)) throw new Unreadable("The confirmed change definition is no longer active. Nothing new was sent.");
  return fresh;
}

async function sendStep(room: Room, task: EditTask, kind: EditStep["kind"], target: ScopeId, on: number | null, fields: Record<string, FieldValue>, options: EditOptions): Promise<boolean> {
  const fresh = await taskRoom(room, task, options);
  if (await head(fresh) !== task.base) throw new Unreadable("The published base moved. Keep this task and compare/reconfirm before a new proposal; nothing new was sent.");
  check(options); const h = handle(fresh, target); const s = await summary(h); check(options);
  if (kind === "open-pr" && canonicalize(s.value.scope) !== canonicalize(task.directory)) throw new Unreadable("The original directory incarnation changed. Nothing new was sent.");
  const supplied = platform(s.value.definition);
  const shape = (supplied?.data ?? task.declared) as unknown as DefinitionShape;
  const declaration = shape.acts[kind]; if (!declaration || !heldActs(shape, fresh.me).acts.some(([k]) => k === kind)) throw new Unreadable(`The current ${kind} action is unavailable to your member.`);
  if (kind !== "open-pr" && s.value.definition !== task.definition) throw new Unreadable("The created lane does not run the confirmed definition.");
  const expected = expectedOf(declaration, s.value.items, on, fields);
  const signer = secretSigner(fresh.session.secret); const signing = fresh.session.now ? { now: fresh.session.now() } : {};
  let signed: SignedIntent, beside: Beside;
  if (supplied) {
    const shaped = shapeDeclaredAct(supplied.data as unknown as DeclaredDefinition, kind, { on, fields } as never);
    signed = await signedIntent(signer, { to: s.value.scope, kind, on: shaped.on, fields: shaped.fields, expected }, signing);
    beside = { ...shaped.beside, values: [task.definitionBytes] };
  } else {
    const typed = await declaredHandle(h, task.declared); if (!typed.ok) throw new Unreadable(`Cannot bind the created lane: ${typed.reason}.`);
    const built = await typed.handle.intent(signer, kind, { on, fields, expected } as never, signing); signed = built.signed; beside = built.beside;
  }
  // The exact serializable envelope belongs to this task before any mutation crosses the transport boundary.
  const step: EditStep = { kind, target: s.value.scope, signed: freeze(JSON.parse(JSON.stringify(signed)) as SignedIntent), grants: freeze([]), beside: freeze(JSON.parse(JSON.stringify(beside)) as Beside), attempted: false };
  task.steps.push(step); options.changed?.();
  const current = await taskRoom(room, task, options);
  if (await head(current) !== task.base) throw new Unreadable("The published base moved before submission. Nothing new was sent.");
  check(options); step.attempted = true; options.changed?.();
  try { step.answer = await h.submit(step.signed, step.grants, step.beside); }
  catch { task.state = "unknown"; task.message = `${kind}: outcome unknown. The original request is kept in this loaded Page. No next step was sent.`; options.changed?.(); return false; }
  options.changed?.(); // Preserve known answer before receipt or other awaited reads.
  if (step.answer.answer === "refused") { task.state = "refused"; task.message = `${kind} refused: ${step.answer.reason}${step.answer.name ? ` (${step.answer.name})` : ""}. Earlier accepted steps remain recorded.`; return false; }
  if (step.answer.answer !== "accepted") { task.state = "unknown"; task.message = `${kind}: ${step.answer.answer}; outcome unknown. Check the original request before another action.`; return false; }
  const followed = await h.followReceipt(step.answer.receipt);
  if (!followed.ok || followed.entry.input.type !== "act" || canonicalize(followed.entry.input.signed) !== canonicalize(step.signed)) { task.state = "unknown"; task.message = `${kind} returned acceptance; its recorded entry could not be verified. The answer and request are retained.`; return false; }
  step.receiptVerified = true;
  return true;
}

/** Continue only the task's next unsent step. Accepted steps are never rebuilt or resent. */
export async function continueEdit(room: Room, task: EditTask, options: EditOptions): Promise<void> {
  if (task.busy || ["unknown", "refused", "recorded", "stopped"].includes(task.state)) return;
  task.busy = true; options.changed?.();
  try {
    check(options);
    if (task.steps.length === 0) {
      const body = `Based on retained source ${task.source.scope.scope}, version ${task.source.manifest}, opening ${task.source.opened}. Original path: ${task.source.path}. This is a new proposal; it does not replace the source version.`;
      if (!await sendStep(room, task, "open-pr", room.directory, null, { definition: task.definition, title: task.draft.title, body, draft: false }, options)) return;
      task.state = "waiting-lane";
    }
    const opened = task.steps.find(s => s.kind === "open-pr");
    if (!opened || opened.answer?.answer !== "accepted" || !opened.receiptVerified) return;
    const fresh = await taskRoom(room, task, options); const D = handle(fresh, room.directory);
    const original = await D.followReceipt(opened.answer.receipt); if (!original.ok) throw new Unreadable("Change opened; its creation entry is currently unreadable.");
    const children = original.entry.sends.filter(s => "creator" in s.to && s.to.kind === "lane").map(s => scopeIdOf(s.to as Seed));
    if (children.length !== 1) throw new Unreadable("The original opening does not name exactly one change lane.");
    task.lane = children[0]!;
    await options.pause?.([room.directory, task.lane]); check(options);
    const L = handle(fresh, task.lane); const lane = await summary(L);
    if (lane.value.status === "refused") throw new Unreadable("The opened change refused its creation. The directory opening remains recorded.");
    if (lane.value.status !== "active") { task.message = "Change opened; waiting for its native lane. Continue checks progress without reopening it."; return; }
    const proposal = lane.value.items.find(i => i.type === "proposal"); if (!proposal) throw new Unreadable("The active change has no proposal item."); task.proposal = proposal.id;
    if (!task.steps.some(s => s.kind === "ask-rules")) {
      if (!await sendStep(room, task, "ask-rules", task.lane, proposal.id, {}, options)) return;
      task.state = "waiting-rules";
    }
    const asked = task.steps.find(s => s.kind === "ask-rules");
    if (!asked?.receiptVerified || asked.answer?.answer !== "accepted") return;
    await options.pause?.([task.lane, room.rules]); check(options);
    const ready = await summary(L);
    if (!ready.value.items.some(i => i.type === "rules" && typeof i.values["revision"] === "number")) { task.message = "Change opened; waiting for its native rules. Continue checks progress without asking again."; return; }
    if (!task.steps.some(s => s.kind === "propose-file")) {
      if (!await sendStep(room, task, "propose-file", task.lane, null, editFields(task.draft, task.base), options)) return;
    }
    const proposed = task.steps.find(s => s.kind === "propose-file")!;
    if (proposed.answer?.answer === "accepted" && proposed.receiptVerified) { task.version = proposed.answer.receipt.fact; task.state = "recorded"; task.message = `Proposal recorded in ${task.lane}, version ${task.version.seq}. Not published. The original source/history is unchanged.`; }
  } catch (error) { task.state = task.steps.some(s => s.attempted && (!s.answer || s.answer.answer === "unavailable" || s.answer.answer === "mismatch" || s.answer.answer === "accepted" && !s.receiptVerified)) ? "unknown" : "stopped"; task.message = `${error instanceof Error ? error.message : "The task could not continue."} Earlier accepted steps and the draft are retained.`; }
  finally { task.busy = false; options.changed?.(); }
}

/** Read-only reconciliation; absence never releases an unknown task or creates a fresh signature. */
export async function checkEditRequest(room: Room, task: EditTask, options: EditOptions): Promise<void> {
  if (task.busy || task.state !== "unknown") return;
  if (task.association !== actAssociation(room, task.source.scope.scope)) { task.message = "Check this task using its original room/key context."; return; }
  const step = task.steps.at(-1); if (!step?.attempted) return;
  task.busy = true;
  try {
    const result = await handle(room, step.target.scope).settle(step.signed);
    if (!result.ok) { task.message = `Original ${step.kind} request remains unresolved: ${result.reason}. No replacement was signed.`; return; }
    step.answer = { answer: "accepted", receipt: result.value }; options.changed?.();
    const verified = await handle(room, step.target.scope).followReceipt(result.value);
    if (!verified.ok || verified.entry.input.type !== "act" || canonicalize(verified.entry.input.signed) !== canonicalize(step.signed)) { task.message = "The acceptance could not be verified; the task stays unknown."; return; }
    step.receiptVerified = true;
    if (step.kind === "propose-file") { task.version = result.value.fact; task.state = "recorded"; task.message = "Proposal recorded. Not published; the original source remains unchanged."; }
    else { task.state = step.kind === "open-pr" ? "waiting-lane" : "waiting-rules"; task.message = "Original request recorded. Continue reads its progress before the next unsent step."; }
  } catch { task.message = "The original request could not be checked. It stays unresolved; no replacement was signed."; }
  finally { task.busy = false; options.changed?.(); }
}
