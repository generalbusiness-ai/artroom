import { invitationIssueFields, invitationRedemptionFields } from "@generalbusiness/artroom-client";
import { INVITATION_KEY_COHORT } from "@generalbusiness/dap-platform";
/** Retained invitation creation and explicitly tagged true-agent enrollment.
 * Store.private holds secrets/envelopes; public config holds only exact pointers.
 * Callers serialize one Store and fence their captured Page context. */
import type { Answer, Entry, FactRef, MemberRef, Receipt, SignedIntent, Summary, ScopeRef } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, entryHash, factRefOf, intentDigest, isMemberRef, isScopeRef, isScopeId, isRecord, isHead, isKeyId, REFUSAL_REASONS, unb64url, timeMs, isReceipt, isSignedIntentShape, keyIdOfSecret, parseStrict, scopeIdOf, textDigest, timeOf, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { agentKeyInvitationOf, encodeAgentKeyInvitation, httpTransport, isAgentKeyMembership, ScopeHandle, secretSigner, signedIntent, requestSession, sessionRequest, type AgentKeyMembership } from "@generalbusiness/artroom-client";
import { APPLICATION_COHORT, FILE_PUBLICATION_COHORT, COUNTING_COHORT, DEMO_REGISTER, DIRECTORY_OF, WEB_DEMO_COHORT, isHandle, platform } from "@generalbusiness/dap-platform";
import { expectedOf, LINK, linkOf, type Context, type DefinitionShape, type Link, type Outcome } from "./commands.ts";
import type { Config, PendingInvitationIssue, Repository } from "./store.ts";

export interface InvitationIssueInput { kind: "person" | "agent-key"; handle: string; hours: number; role?: "member" | "maintainer" | "admin"; controller?: MemberRef }
export interface InvitationIssueOptions { privateRequests: readonly string[]; reservedRequest?: string; mode: "new" | "check" | "continue"; operation: string; current?: () => boolean }
export interface InvitationIssueResult { operation: string; kind: "person" | "agent-key"; handle: string; state: "prepared" | "unknown" | "refused" | "verified"; reason?: string; /** Private handoff, never put into a public status log. */ link?: string }
interface Stage { signed: SignedIntent; attempted: boolean; receipt?: Receipt; refused?: Extract<Answer, { answer: "refused" }> }
interface Issue { previous?: { request: string; digest: import("@generalbusiness/dap-contract").Digest }; v: 1; operation: string; input: InvitationIssueInput; service: string; repository: Repository; actor: string; secret: string; ends: string; /** The membership's pinned definition, read at issuance; a retained row without it is a membership@2 row. */ definition?: AgentKeyMembership; member?: Stage; invitation?: Stage; link?: string }
const same = (a: unknown, b: unknown) => a === undefined || b === undefined ? a === b : canonicalize(a) === canonicalize(b);
const blocked = () => new Error("The original invitation custody or context is unavailable. Nothing was replaced.");
const privateName = (prefix: "i" | "a" | "k") => prefix + "-" + crypto.randomUUID().replace(/-/g, "").slice(0, 30);
const uuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const now = (ctx: Context) => ctx.now?.() ?? Date.now();
function check(options: InvitationIssueOptions): void { if (options.current?.() === false) throw blocked(); }
const wait = async <T>(options: InvitationIssueOptions, work: () => Promise<T>): Promise<T> => { check(options); const result = await work(); check(options); return result; };
async function readerFor(ctx: Context, service: string, membership: ScopeRef, secret: Uint8Array): Promise<string> {
  const signed = sessionRequest(membership, secret, timeOf(Math.floor(now(ctx) / 1000) * 1000 + 60_000), b64url(crypto.getRandomValues(new Uint8Array(16))));
  const answer = await requestSession(service, membership.scope, signed, ctx.fetch ? { fetch: ctx.fetch } : {});
  if (!answer.ok || answer.session.claims.key !== keyIdOfSecret(secret) || !same(answer.session.claims.membership, membership)) throw blocked();
  return answer.session.reader(); // Volatile only; never stored or used as act authority.
}
function handle(ctx: Context, service: string, scope: import("@generalbusiness/dap-contract").ScopeId, reader: string): ScopeHandle {
  return new ScopeHandle(httpTransport(service, ctx.fetch ? { fetch: ctx.fetch } : {}), scope, reader);
}
/**
 * The membership's summary, which must name the exact definition expected: the pin a retained issuance or an invitation
 * carries. The same acts (`add-member`, `invite-key`, `enrol`) exist under each supported pin; the pin is what the receipts
 * are checked against, never a name alone.
 */
async function summary(M: ScopeHandle, at: ScopeRef, definition: AgentKeyMembership): Promise<Summary> {
  const read = await M.summary();
  if (!read.ok || !read.complete || read.next !== undefined || !same(read.value.scope, at) || read.value.definition !== definition) throw blocked();
  return read.value;
}
/** The membership's summary and its pinned definition, which must be one this command enrols agents under. */
async function pinnedSummary(M: ScopeHandle, at: ScopeRef): Promise<{ summary: Summary; definition: AgentKeyMembership }> {
  const read = await M.summary();
  if (!read.ok || !read.complete || read.next !== undefined || !same(read.value.scope, at) || !isAgentKeyMembership(read.value.definition) || platform(read.value.definition)?.data.name !== "platform:membership") throw blocked();
  return { summary: read.value, definition: read.value.definition };
}
/** The directory definitions each membership pin is created beside: exact pairs of the cohorts, not names. */
const DIRECTORIES_OF: Readonly<Record<AgentKeyMembership, readonly string[]>> = {
  "platform:membership@2": [DIRECTORY_OF[DEMO_REGISTER]!, WEB_DEMO_COHORT.directory],
  "platform:membership@4": [APPLICATION_COHORT.directory, FILE_PUBLICATION_COHORT.directory],
  "platform:membership@5": [COUNTING_COHORT.directory],
  "platform:membership@6": [INVITATION_KEY_COHORT.directory],
};
const pinOf = (issue: Pick<Issue, "definition">): AgentKeyMembership => issue.definition ?? "platform:membership@2";
const closed = (value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> => isRecord(value) && required.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => required.includes(k) || optional.includes(k));
async function boundDirectory(ctx: Context, service: string, reader: string, repository: Repository, membership: Summary, definition: AgentKeyMembership): Promise<Repository | null> {
  const roster = membership.items.find(item => item.type === "roster" && item.state === "open");
  if (!roster || !same(roster.refs["directory"], repository.directory)) return null;
  const read = await handle(ctx, service, repository.directory.scope, reader).summary();
  if (!read.ok || !read.complete || read.next !== undefined || read.value.status !== "active" || !DIRECTORIES_OF[definition].includes(read.value.definition) || !same(read.value.scope, repository.directory)) return null;
  const item = read.value.items.find(item => item.type === "repository"), rules = item?.refs["rules"], destination = item?.refs["destination"];
  if (!item || !same(item.refs["membership"], repository.membership) || !isScopeRef(rules) || rules.kind !== "rules" || rules.scope !== repository.rules || !isScopeRef(destination) || destination.kind !== "destination" || destination.scope !== repository.destination) return null;
  return { directory: read.value.scope, membership: membership.scope, rules: rules.scope, destination: destination.scope };
}
export function isInvitationIssueInput(value: unknown): value is InvitationIssueInput {
  if (!closed(value, ["kind", "handle", "hours"], ["role", "controller"])) return false;
  const input = value as unknown as InvitationIssueInput;
  if (!closed(input, ["kind", "handle", "hours"], ["role", "controller"]) || !isHandle(input.handle) || utf8(input.handle).length > 256 || !Number.isFinite(input.hours) || input.hours <= 0) return false;
  return input.kind === "person" ? ["member", "maintainer", "admin"].includes(input.role ?? "") && input.controller === undefined : input.kind === "agent-key" && input.role === undefined && isMemberRef(input.controller);
}
function repositoryValid(r: unknown): r is Repository {
  if (!closed(r, ["directory", "membership", "rules", "destination"], ["inbox"])) return false;
  return isScopeRef(r["directory"]) && r["directory"].kind === "directory" && isScopeRef(r["membership"]) && r["membership"].kind === "membership" && isScopeId(r["rules"]) && isScopeId(r["destination"]) && (r["inbox"] === undefined || isScopeId(r["inbox"]));
}
function stageValid(stage: Stage, issue: Issue, kind: string): boolean {
  if (!closed(stage, ["signed", "attempted"], ["receipt", "refused"]) || !isSignedIntentShape(stage.signed) || !verifySignedIntent(stage.signed) || stage.signed.intent.kind !== kind || stage.signed.intent.actor !== issue.actor || !same(stage.signed.intent.to, issue.repository.membership) || typeof stage.attempted !== "boolean") return false;
  if (stage.receipt && (!stage.attempted || !isReceipt(stage.receipt) || stage.receipt.definition !== pinOf(issue) || stage.receipt.intent !== intentDigest(stage.signed.intent) || !same(stage.receipt.fact.at, issue.repository.membership))) return false;
  if (stage.refused && (!stage.attempted || stage.receipt || !closed(stage.refused, ["answer", "reason", "judgedAt"], ["name"]) || stage.refused.answer !== "refused" || !Object.hasOwn(REFUSAL_REASONS, stage.refused.reason) || !isHead(stage.refused.judgedAt) || stage.refused.name !== undefined && typeof stage.refused.name !== "string")) return false;
  return true;
}
function issueValid(value: unknown): value is Issue {
  try {
    if (!closed(value, ["v", "operation", "input", "service", "repository", "actor", "secret", "ends"], ["member", "invitation", "link", "previous", "definition"])) return false;
    const row = value as unknown as Issue;
    if (row.definition !== undefined && !isAgentKeyMembership(row.definition)) return false;
    if (row.v !== 1 || !uuid(row.operation) || !isInvitationIssueInput(row.input) || typeof row.secret !== "string" || typeof row.ends !== "string" || timeMs(row.ends) === null || !isKeyId(row.actor) || !repositoryValid(row.repository) || typeof row.service !== "string") return false;
    if (row.previous && (!closed(row.previous, ["request", "digest"]) || typeof row.previous.request !== "string" || !/^i-[0-9a-f]{30}$/.test(row.previous.request) || !/^sha256:[0-9a-f]{64}$/.test(row.previous.digest))) return false;
    const secret = unb64url(row.secret);
    if (!secret || secret.length !== 32 || b64url(secret) !== row.secret) return false;
    const Url = (globalThis as { URL?: new (url: string) => { origin: string; protocol: string; username: string; password: string; search: string; hash: string } }).URL;
    if (!Url) return false;
    const origin = new Url(row.service);
    if (origin.origin !== row.service || !["https:", "http:"].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || row.input.controller && !same(row.input.controller.membership, row.repository.membership)) return false;
    if (row.member && (!stageValid(row.member, row, "add-member") || !same(row.member.signed.intent.fields, { handle: row.input.handle, kind: "agent", controller: row.input.controller }))) return false;
    const invited = row.invitation;
    if (invited) {
      if (row.input.kind === "agent-key" && !row.member?.receipt) return false;
      const fields = row.input.kind === "person" ? { handle: row.input.handle, role: row.input.role, ...invitationIssueFields(pinOf(row), row.secret), inviteEnds: row.ends } : { member: row.member!.receipt!.fact.seq, kind: "agent", ...invitationIssueFields(pinOf(row), row.secret), inviteEnds: row.ends };
      if (!stageValid(invited, row, row.input.kind === "person" ? "invite-member" : "invite-key") || !same(invited.signed.intent.fields, fields)) return false;
    }
    if (row.link !== undefined) {
      if (typeof row.link !== "string" || !row.invitation?.receipt) return false;
      const { inbox: _inbox, ...repository } = row.repository;
      if (row.input.kind === "person") {
        const parsed = linkOf(row.link);
        if (!parsed || !same(parsed, { v: 1, service: row.service, repository, invitation: row.invitation.receipt.fact.seq, secret: row.secret, handle: row.input.handle, definition: pinOf(row) })) return false;
      } else {
        const parsed = agentKeyInvitationOf(row.link);
        if (!parsed || !row.member?.receipt || parsed.definition !== pinOf(row) || parsed.service !== row.service || !same(parsed.repository, repository) || parsed.handle !== row.input.handle || !same(parsed.controller, row.input.controller) || !same(parsed.member, row.member.receipt.fact) || !same(parsed.invitation, row.invitation.receipt.fact) || parsed.secret !== row.secret) return false;
      }
    }
    return row.input.kind !== "person" || row.member === undefined;
  } catch { return false; }
}
function successor(before: Issue, after: Issue): boolean {
  const core = (row: Issue) => ({ v: row.v, operation: row.operation, input: row.input, service: row.service, repository: row.repository, actor: row.actor, secret: row.secret, ends: row.ends, definition: pinOf(row) });
  if (!same(core(before), core(after)) || before.link !== undefined && before.link !== after.link) return false;
  for (const name of ["member", "invitation"] as const) {
    const prior = before[name], next = after[name];
    if (!prior) { if (next && (next.attempted || next.receipt || next.refused)) return false; continue; }
    if (!next || !same(prior.signed, next.signed) || prior.attempted && !next.attempted || prior.receipt && !same(prior.receipt, next.receipt) || prior.refused && !same(prior.refused, next.refused)) return false;
  }
  return true;
}
async function snapshotChain(ctx: Context, config: Config, input: InvitationIssueInput, actor: import("@generalbusiness/dap-contract").KeyId, options: InvitationIssueOptions): Promise<{ row: Issue; pointer: PendingInvitationIssue } | null> {
  if (!Array.isArray(options.privateRequests) || new Set(options.privateRequests).size !== options.privateRequests.length) throw blocked();
  const rows = new Map<string, { row: Issue; digest: import("@generalbusiness/dap-contract").Digest }>();
  for (const request of options.privateRequests) {
    if (!/^i-[0-9a-f]{30}$/.test(request)) throw blocked();
    const bytes = await wait(options, () => ctx.store.private(request));
    if (!bytes || bytes.length > 64 * 1024) throw blocked();
    const raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes), value = parseStrict(raw);
    if (!issueValid(value) || value.operation !== options.operation || value.actor !== actor || value.service !== config.service || !same(value.repository, config.repository) || !same(value.input, input)) throw blocked();
    rows.set(request, { row: value, digest: textDigest(raw) });
  }
  if (rows.size === 0) { if (config.invitationIssue) throw blocked(); return null; }
  const roots = [...rows].filter(([, entry]) => !entry.row.previous);
  if (roots.length !== 1 || roots[0]![1].row.member || roots[0]![1].row.invitation || roots[0]![1].row.link) throw blocked();
  const next = new Map<string, string>();
  for (const [request, entry] of rows) if (entry.row.previous) {
    const prior = rows.get(entry.row.previous.request);
    if (!prior || prior.digest !== entry.row.previous.digest || next.has(entry.row.previous.request) || !successor(prior.row, entry.row)) throw blocked();
    next.set(entry.row.previous.request, request);
  }
  let request = roots[0]![0]; const visited = new Set<string>();
  for (;;) { if (visited.has(request)) throw blocked(); visited.add(request); const following = next.get(request); if (!following) break; request = following; }
  if (visited.size !== rows.size) throw blocked();
  if (config.invitationIssue) {
    const current = rows.get(config.invitationIssue.request);
    if (!current || current.digest !== config.invitationIssue.digest || config.invitationIssue.operation !== options.operation || config.invitationIssue.actor !== actor || !same(config.invitationIssue.membership, config.repository!.membership)) throw blocked();
  } else if (options.mode !== "continue" || options.reservedRequest !== request || rows.size !== 1) throw blocked();
  const leaf = rows.get(request)!;
  return { row: leaf.row, pointer: { operation: options.operation, request, digest: leaf.digest, membership: leaf.row.repository.membership, actor: actor } };
}
async function followFact(M: ScopeHandle, fact: FactRef): Promise<Entry | null> {
  const read = await M.entry(fact.seq);
  return read.ok && read.complete && read.next === undefined && same(factRefOf(read.value.entry), fact) && read.value.hash === fact.hash && entryHash(read.value.entry) === fact.hash ? read.value.entry : null;
}
async function follow(M: ScopeHandle, signed: SignedIntent, receipt: Receipt, definition: AgentKeyMembership): Promise<Entry | null> {
  if (!isReceipt(receipt) || receipt.definition !== definition || receipt.intent !== intentDigest(signed.intent) || !same(receipt.fact.at, signed.intent.to)) return null;
  const read = await M.followReceipt(receipt);
  return read.ok && read.entry.input.type === "act" && same(read.entry.input.signed, signed) ? read.entry : null;
}
/** M2 records an inbox create send, not member.refs.inbox (EM9). */
async function inboxOfOpening(ctx: Context, service: string, reader: string, opening: Entry, membership: ScopeRef, owner: MemberRef): Promise<ScopeRef | null> {
  const births = opening.sends.filter(send => "creator" in send.to && send.to.kind === "inbox");
  const birth = births.length === 1 ? births[0] : undefined;
  if (!birth || !("creator" in birth.to) || birth.to.definition !== "platform:inbox@1" || !same(birth.to.creator, membership)) return null;
  const scope = scopeIdOf(birth.to), I = handle(ctx, service, scope, reader);
  const [summaryRead, birthRead] = await Promise.all([I.summary(), I.entry(0)]);
  if (!summaryRead.ok || !summaryRead.complete || summaryRead.next !== undefined || summaryRead.value.status !== "active" || summaryRead.value.definition !== "platform:inbox@1" || summaryRead.value.scope.kind !== "inbox" || summaryRead.value.scope.scope !== scope || !birthRead.ok || !birthRead.complete || birthRead.next !== undefined) return null;
  const entry = birthRead.value.entry;
  if (entry.seq !== 0 || entry.input.type !== "genesis" || entry.input.decision !== "applied" || entry.input.kind !== "establish" || entry.input.inc !== summaryRead.value.scope.inc || !same(entry.at, summaryRead.value.scope) || !same(entry.input.seed, birth.to) || !same(entry.input.source, factRefOf(opening)) || entry.input.n !== birth.n || entryHash(entry) !== birthRead.value.hash) return null;
  const inbox = summaryRead.value.items.find(item => item.type === "inbox" && item.state === "open");
  return inbox && same(inbox.parties["owner"], owner) && same(inbox.refs["membership"], membership) ? summaryRead.value.scope : null;
}
/** No output exposes a signing key. The optional link is a private invitation. */
export async function issueInvitation(ctx: Context, input: InvitationIssueInput, options: InvitationIssueOptions): Promise<InvitationIssueResult> {
  check(options);
  if (!uuid(options.operation) || !isInvitationIssueInput(input)) throw blocked();
  let config = await wait(options, () => ctx.store.config());
  if (!config?.repository || config.claim || config.join || config.plan && !config.register) throw blocked();
  const secret = await wait(options, () => ctx.store.secret(config!.key));
  if (!secret || secret.length !== 32) throw blocked();
  // Work on an owned copy: a memory Store may return its original key array.
  const key = secret.slice();
  try {
    const actor = keyIdOfSecret(key);
    let reader: string | undefined, currentHandle: ScopeHandle | undefined;
    const membershipHandle = async (): Promise<ScopeHandle> => {
      if (!currentHandle) { reader = await wait(options, () => readerFor(ctx, config!.service, config!.repository!.membership, key)); currentHandle = handle(ctx, config!.service, config!.repository!.membership.scope, reader); }
      return currentHandle;
    };
    let row: Issue;
    let pointer = config.invitationIssue;
    const chain = await snapshotChain(ctx, config, input, actor, options);
    if (chain) {
      if (options.mode === "new") throw blocked();
      row = chain.row;
      if (!same(pointer, chain.pointer)) {
        if (options.mode === "check") return { operation: row.operation, kind: row.input.kind, handle: row.input.handle, state: "unknown", reason: "A retained private successor awaits explicit Continue. Check restored no pointer and sent nothing." };
        const before = config;
        if (!same(await wait(options, () => ctx.store.config()), before)) throw blocked();
        pointer = chain.pointer; config = { ...before, invitationIssue: pointer };
        await wait(options, () => ctx.store.save(config!));
        if (!same(await wait(options, () => ctx.store.config()), config)) throw blocked();
      }
    } else {
      if (options.mode !== "new") throw blocked();
      // The membership's exact pin is read once and kept with the retained issuance: every later read and receipt is held to it.
      const pinned = await wait(options, async () => pinnedSummary(await membershipHandle(), config!.repository!.membership));
      row = { v: 1, operation: options.operation, input: structuredClone(input), service: config.service, repository: structuredClone(config.repository), actor, secret: b64url(crypto.getRandomValues(new Uint8Array(32))), ends: timeOf(Math.floor(now(ctx) / 1000) * 1000 + input.hours * 3600_000), definition: pinned.definition };
    }
    const status = (state: InvitationIssueResult["state"], reason?: string): InvitationIssueResult => ({ operation: row.operation, kind: row.input.kind, handle: row.input.handle, state, ...(reason ? { reason } : {}) });
    const persist = async (): Promise<void> => {
      if (!issueValid(row)) throw blocked();
      const before = await wait(options, () => ctx.store.config());
      if (!same(before, config)) throw blocked();
      if (pointer) row.previous = { request: pointer.request, digest: pointer.digest };
      const raw = canonicalize(row), request = privateName("i");
      await wait(options, () => ctx.store.keepPrivate(request, utf8(raw)));
      const bytes = await wait(options, () => ctx.store.private(request));
      if (!bytes || new TextDecoder().decode(bytes) !== raw) throw blocked();
      pointer = { operation: row.operation, request, digest: textDigest(raw), membership: row.repository.membership, actor };
      config = { ...config!, invitationIssue: pointer };
      await wait(options, () => ctx.store.save(config!));
      if (!same(await wait(options, () => ctx.store.config()), config)) throw blocked();
    };
    if (!pointer) await persist();
    const pin = pinOf(row);
    const shape = platform(pin)!.data as unknown as DefinitionShape;
    const prepare = async (kind: string, fields: Record<string, import("@generalbusiness/dap-contract").FieldValue>): Promise<Stage> => {
      const s = await wait(options, async () => summary(await membershipHandle(), row.repository.membership, pin));
      const member = s.items.find(i => i.type === "member" && i.state === "active" && i.values["handle"] === config!.handle);
      const activeKey = member && s.items.find(i => i.type === "key" && i.state === "active" && i.refs["member"] === member.id && i.values["id"] === actor);
      const roster = s.items.find(i => i.type === "roster" && i.state === "open");
      const role = member?.values["role"], actions = typeof role === "string" ? roster?.values[role + "Actions"] : null;
      if (!activeKey || !member || member.values["kind"] !== "person" || !Array.isArray(actions) || !actions.includes("membership.invite") || row.input.kind === "agent-key" && (!actions.includes("membership.manage") || !same(row.input.controller, member.parties["member"]))) throw blocked();
      const signed = await wait(options, () => signedIntent(secretSigner(key), { to: row.repository.membership, kind, fields, expected: expectedOf(shape.acts[kind]!, s.items, null, fields) }, { now: now(ctx) }));
      return { signed, attempted: false };
    };
    const advance = async (stage: Stage): Promise<"verified" | "unknown" | "refused"> => {
      if (stage.refused) return "refused";
      if (options.mode === "check" || stage.receipt) {
        let settled: Awaited<ReturnType<ScopeHandle["settle"]>>;
        try { settled = await wait(options, async () => (await membershipHandle()).settle(stage.signed)); } catch { check(options); return "unknown"; }
        if (!settled.ok || stage.receipt && !same(settled.value, stage.receipt) || !await wait(options, async () => follow(await membershipHandle(), stage.signed, settled.value, pin))) return "unknown";
        if (!stage.attempted || !stage.receipt) { stage.attempted = true; stage.receipt = settled.value; await persist(); }
        return "verified";
      }
      // An already attempted stage is sent again unchanged and keeps no new snapshot, so a chain holds at most one snapshot for each
      // change of state: root, prepared, attempted and settled for each stage (seven for an agent key, four for a person).
      if (!stage.attempted) { stage.attempted = true; await persist(); }
      let answer: Answer;
      try { answer = await wait(options, async () => (await membershipHandle()).submit(stage.signed)); } catch { check(options); return "unknown"; }
      if (answer.answer === "refused") { stage.refused = answer; await persist(); return "refused"; }
      if (answer.answer !== "accepted") return "unknown";
      if (!await wait(options, async () => follow(await membershipHandle(), stage.signed, answer.receipt, pin))) return "unknown";
      stage.receipt = answer.receipt; await persist(); return "verified";
    };
    if (row.input.kind === "agent-key") {
      if (!row.member) {
        if (options.mode === "check") return status("prepared", "Continue explicitly to prepare the original agent opening.");
        row.member = await prepare("add-member", { handle: row.input.handle, kind: "agent", controller: row.input.controller! }); await persist();
      }
      const result = await advance(row.member);
      if (result !== "verified") return status(result, result === "refused" ? `Native refusal: ${row.member.refused!.reason}${row.member.refused!.name ? " (" + row.member.refused!.name + ")" : ""}. The original agent opening is retained.` : "The original agent opening is retained.");
    }
    if (!row.invitation) {
      if (options.mode === "check") return status("prepared", "Continue explicitly to prepare the original invitation.");
      const fields = row.input.kind === "person" ? { handle: row.input.handle, role: row.input.role!, ...invitationIssueFields(pinOf(row), row.secret), inviteEnds: row.ends } : { member: row.member!.receipt!.fact.seq, kind: "agent", ...invitationIssueFields(pinOf(row), row.secret), inviteEnds: row.ends };
      row.invitation = await prepare(row.input.kind === "person" ? "invite-member" : "invite-key", fields); await persist();
    }
    const result = await advance(row.invitation);
    if (result !== "verified") return status(result, result === "refused" ? `Native refusal: ${row.invitation.refused!.reason}${row.invitation.refused!.name ? " (" + row.invitation.refused!.name + ")" : ""}. The original invitation is retained.` : "The original invitation is retained.");
    const receipt = row.invitation.receipt!, s = await wait(options, async () => summary(await membershipHandle(), row.repository.membership, pin));
    const invited = s.items.find(i => i.id === receipt.fact.seq && i.type === (row.input.kind === "person" ? "member" : "key"));
    if (!invited || invited.state !== "invited" || Object.entries(invitationIssueFields(pin, row.secret)).some(([name, value]) => invited.values[name] !== value) || invited.values["inviteEnds"] !== row.ends) return status("unknown", "The current native invitation could not be verified.");
    const observedRepository = await wait(options, () => boundDirectory(ctx, row.service, reader!, row.repository, s, pin));
    if (!observedRepository) return status("unknown", "The native directory and repository siblings could not be verified.");
    const repository = observedRepository;
    let link: string;
    if (row.input.kind === "person") {
      if (invited.values["kind"] !== "person" || invited.values["handle"] !== row.input.handle || invited.values["role"] !== row.input.role) return status("unknown");
      const person: Link = { v: 1, service: row.service, repository, invitation: receipt.fact.seq, secret: row.secret, handle: row.input.handle, definition: pin };
      link = LINK + b64url(utf8(JSON.stringify(person)));
    } else {
      const member = s.items.find(i => i.type === "member" && i.id === row.member!.receipt!.fact.seq), roster = s.items.find(i => i.type === "roster" && i.state === "open");
      const controller = s.items.find(item => item.type === "member" && item.state === "active" && item.values["kind"] === "person" && same(item.parties["member"], row.input.controller));
      if (!controller || !s.items.some(item => item.type === "key" && item.state === "active" && item.refs["member"] === controller.id) || !member || member.state !== "active" || member.values["kind"] !== "agent" || member.values["role"] !== "agent" || member.values["handle"] !== row.input.handle || !same(member.parties["controller"], row.input.controller) || invited.values["kind"] !== "agent" || invited.refs["member"] !== member.id || !isMemberRef(member.parties["member"]) || !roster) return status("unknown");
      const owner = member.parties["member"];
      const opening = await wait(options, async () => follow(await membershipHandle(), row.member!.signed, row.member!.receipt!, pin));
      if (!opening || !await wait(options, () => inboxOfOpening(ctx, row.service, reader!, opening, row.repository.membership, owner))) return status("unknown", "The native agent inbox creation could not be verified.");
      link = encodeAgentKeyInvitation({ v: 1, kind: "agent-key", service: row.service, repository, definition: pin, handle: row.input.handle, controller: row.input.controller!, member: row.member!.receipt!.fact, invitation: receipt.fact, secret: row.secret, expected: { on: roster.revision, member: member.revision } });
    }
    if (!row.link) { row.link = link; await persist(); }
    return { ...status("verified"), link: row.link };
  } finally { key.fill(0); }
}

/** Separate receiver; a tagged key invitation never runs native person join. */
export async function enrolAgentKey(ctx: Context, text: string, options: { mode?: "continue" | "check" } = {}): Promise<Outcome> {
  const bad = (): Outcome => ({ code: 1, lines: ["The original agent enrollment is unavailable or unverified. Nothing was replaced."] });
  try {
    const link = agentKeyInvitationOf(text);
    if (!link) return bad();
    let config = await ctx.store.config();
    let heldConfig = config;
    const save = async (next: Config): Promise<void> => {
      if (!same(await ctx.store.config(), heldConfig)) throw blocked();
      await ctx.store.save(next);
      if (!same(await ctx.store.config(), next)) throw blocked();
      heldConfig = next;
    };
    const digest = textDigest(canonicalize(link)), pending = config?.join;
    if (pending && (pending.kind !== "enrol" || pending.link !== digest || config!.service !== link.service || !same(pending.repository, link.repository) || pending.handle !== link.handle) || config && !pending) return bad();
    if (pending?.refused) return { code: 1, lines: [`The original agent enrollment was refused: ${pending.refused.reason}. Nothing was replaced.`] };
    if (options.mode === "check" && !pending) return bad();
    let own: Uint8Array | null = null;
    const tag = digest.slice("sha256:".length, "sha256:".length + 30), keyName = "k-" + tag, requestName = "a-" + tag;
    let originalBytes: Uint8Array | null = null, freshKey = false;
    if (pending) own = await ctx.store.secret(config!.key);
    else {
      own = await ctx.store.secret(keyName);
      originalBytes = await ctx.store.private(requestName);
      // A surviving key without its original envelope is not proof of no
      // dispatch. Never manufacture a replacement signature from absence.
      if (own && !originalBytes || originalBytes && !own) return bad();
      if (!own) {
        own = crypto.getRandomValues(new Uint8Array(32)); freshKey = true;
        await ctx.store.keep(keyName, own);
        const readback = await ctx.store.secret(keyName);
        if (!readback || !same([...readback], [...own])) { own.fill(0); return bad(); }
      }
      config = { v: 1, service: link.service, key: keyName };
    }
    if (!own || own.length !== 32) return bad();
    const key = own.slice();
    // Fresh raw key is no longer needed after its owned snapshot/store readback.
    if (freshKey) own.fill(0);
    try {
      let signed: SignedIntent;
      const readEnvelope = (bytes: Uint8Array, legacy: boolean): SignedIntent | null => {
        if (bytes.length > 32 * 1024) return null;
        const value = parseStrict(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
        if (closed(value, ["v", "link", "signed"]) && value["v"] === 1 && value["link"] === digest && isSignedIntentShape(value["signed"])) return value["signed"];
        return legacy && isSignedIntentShape(value) ? value : null;
      };
      if (pending) {
        const bytes = await ctx.store.private(pending.request);
        const kept = bytes && readEnvelope(bytes, true);
        if (!kept) return bad(); signed = kept;
      } else {
        if (originalBytes) {
          const kept = readEnvelope(originalBytes, false);
          if (!kept) return bad(); signed = kept;
        } else {
          signed = await signedIntent(secretSigner(key), { to: link.repository.membership, kind: "enrol", on: 0, fields: invitationRedemptionFields(link.definition, link.repository.membership, link.invitation.seq, keyIdOfSecret(key), link.secret), expected: link.expected }, { now: now(ctx) });
          const raw = canonicalize({ v: 1, link: digest, signed });
          await ctx.store.keepPrivate(requestName, utf8(raw));
          const readback = await ctx.store.private(requestName);
          if (!readback || new TextDecoder().decode(readback) !== raw) return bad();
        }
        config = { ...config!, join: { kind: "enrol", request: requestName, intent: intentDigest(signed.intent), link: digest, repository: link.repository, handle: link.handle } };
        // Validate the original before restoring its public pointer.
        if (!verifySignedIntent(signed) || signed.intent.actor !== keyIdOfSecret(key) || signed.intent.kind !== "enrol" || signed.intent.on !== 0 || !same(signed.intent.to, link.repository.membership) || !same(signed.intent.fields, invitationRedemptionFields(link.definition, link.repository.membership, link.invitation.seq, keyIdOfSecret(key), link.secret)) || !same(signed.intent.expected, link.expected)) return bad();
        await save(config);
      }
      if (!verifySignedIntent(signed) || signed.intent.actor !== keyIdOfSecret(key) || signed.intent.kind !== "enrol" || signed.intent.on !== 0 || !same(signed.intent.to, link.repository.membership) || !same(signed.intent.fields, invitationRedemptionFields(link.definition, link.repository.membership, link.invitation.seq, keyIdOfSecret(key), link.secret)) || !same(signed.intent.expected, link.expected) || intentDigest(signed.intent) !== config!.join!.intent) return bad();
      let M = new ScopeHandle(httpTransport(link.service, ctx.fetch ? { fetch: ctx.fetch } : {}), link.repository.membership.scope);
      if (!same(await ctx.store.config(), heldConfig)) return bad();
      let receipt: Receipt;
      if (options.mode === "check" || config!.join!.accepted) {
        const settled = await M.settle(signed);
        if (!settled.ok || config!.join!.accepted && !same(settled.value.fact, config!.join!.accepted)) return bad();
        receipt = settled.value;
      } else {
        const answer = await M.submit(signed);
        if (answer.answer === "refused") {
          config = { ...config!, join: { ...config!.join!, refused: answer } };
          await save(config);
          if (!same(await ctx.store.config(), config)) return bad();
          return { code: 1, lines: [`Agent enrollment refused: ${answer.reason}. The exact original remains retained.`] };
        }
        if (answer.answer !== "accepted") return { code: 1, lines: ["The original agent enrollment remains unknown. Check it or Continue explicitly."] };
        receipt = answer.receipt;
      }
      const reader = await readerFor(ctx, link.service, link.repository.membership, key);
      M = handle(ctx, link.service, link.repository.membership.scope, reader);
      // The exact pin: the receipt names the membership's definition; an invitation issued under another is not verified, and
      // the original enrolment stays retained.
      if (isReceipt(receipt) && receipt.definition !== link.definition) return { code: 1, lines: [`The invitation names ${link.definition}, and the membership's receipt names ${receipt.definition}. The exact original enrolment is retained unverified; nothing was replaced.`] };
      if (!await follow(M, signed, receipt, link.definition)) return bad();
      config = { ...config!, join: { ...config!.join!, accepted: receipt.fact } }; await save(config);
      if (!same(await ctx.store.config(), config)) return bad();
      const [memberEntry, invitationEntry, s] = await Promise.all([followFact(M, link.member), followFact(M, link.invitation), summary(M, link.repository.membership, link.definition)]);
      if (!memberEntry || !invitationEntry || memberEntry.input.type !== "act" || invitationEntry.input.type !== "act") return bad();
      const opened = memberEntry.input.signed.intent, invited = invitationEntry.input.signed.intent;
      if (opened.kind !== "add-member" || !same(opened.fields, { handle: link.handle, kind: "agent", controller: link.controller }) || invited.kind !== "invite-key" || !same(invited.fields, { member: link.member.seq, kind: "agent", ...invitationIssueFields(link.definition, link.secret), inviteEnds: invited.fields["inviteEnds"] })) return bad();
      const member = s.items.find(i => i.type === "member" && i.id === link.member.seq), activeKey = s.items.find(i => i.type === "key" && i.id === link.invitation.seq);
      const controller = s.items.find(item => item.type === "member" && item.state === "active" && item.values["kind"] === "person" && same(item.parties["member"], link.controller));
      if (!controller || !s.items.some(item => item.type === "key" && item.state === "active" && item.refs["member"] === controller.id) || !member || member.state !== "active" || member.values["handle"] !== link.handle || member.values["kind"] !== "agent" || member.values["role"] !== "agent" || !same(member.parties["controller"], link.controller) || !activeKey || activeKey.state !== "active" || activeKey.values["kind"] !== "agent" || activeKey.values["id"] !== keyIdOfSecret(key) || activeKey.refs["member"] !== member.id || !isMemberRef(member.parties["member"])) return bad();
      const observed = await boundDirectory(ctx, link.service, reader, link.repository, s, link.definition);
      if (!observed) return bad();
      const inbox = await inboxOfOpening(ctx, link.service, reader, memberEntry, link.repository.membership, member.parties["member"]);
      if (!inbox) return bad();
      config = { ...config!, repository: { ...observed, inbox: inbox.scope }, handle: link.handle };
      await save(config);
      if (!same(await ctx.store.config(), config)) return bad();
      return { code: 0, lines: [`Enrolled independent agent ${link.handle}. Native agent and controller bindings verified.`] };
    } finally { key.fill(0); }
  } catch { return bad(); }
}

/** The retained person issuance a configuration points at: its private snapshots, root first, its input and its operation. */
async function retainedIssue(ctx: Context, pointer: PendingInvitationIssue): Promise<{ names: string[]; input: InvitationIssueInput; operation: string } | null> {
  const names: string[] = [];
  let request: string | undefined = pointer.request, input: InvitationIssueInput | null = null;
  while (request !== undefined) {
    // Sixteen is more than the seven snapshots the engine writes for the longest issuance, so a lawful chain is always readable.
    if (names.includes(request) || names.length >= 16) return null;
    const bytes = await ctx.store.private(request);
    if (!bytes) return null;
    const value = parseStrict(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
    if (!issueValid(value) || value.operation !== pointer.operation) return null;
    input ??= value.input;
    names.unshift(request);
    request = value.previous?.request;
  }
  return input ? { names, input, operation: pointer.operation } : null;
}

/**
 * `dap invite <@member> --role <role> --keep`: a person invitation through the retained issuance of `issueInvitation`, which
 * keeps the secret and the exact signed request before anything is sent and reads the membership's own pin, so the link is
 * tagged with the membership's definition. One retained invitation at a time: `dap invite --check` reads its outcome and
 * sends nothing; `dap invite --continue` resumes the exact original. A finished one (verified or refused) is released, and its
 * link is printed once, as `dap invite` prints it. An unknown one blocks a new one, so a lost answer is never replaced.
 */
export async function invitePerson(ctx: Context, member: string | undefined, options: { role?: string; hours?: number; mode: "new" | "check" | "continue" }): Promise<Outcome> {
  const say = (code: Outcome["code"], ...lines: string[]): Outcome => ({ code, lines });
  const finish = async (result: InvitationIssueResult): Promise<Outcome> => {
    if (result.state === "verified" || result.state === "refused") {
      const { invitationIssue: _finished, ...released } = (await ctx.store.config())!;
      await ctx.store.save(released);
    }
    if (result.state === "verified") return say(0, `Invited ${result.handle}: the invitation is recorded and verified.`, `Link for ${result.handle} only (it holds the invitation's secret): ${result.link}`);
    if (result.state === "refused") return say(1, `The invitation of ${result.handle} was refused. ${result.reason ?? ""}`.trim());
    return say(1, `The invitation of ${result.handle} is ${result.state}. ${result.reason ?? ""} Run dap invite --check, or dap invite --continue to resume the exact original.`.replace(/\s+/g, " ").trim());
  };
  try {
    const config = await ctx.store.config();
    if (!config?.repository) return say(2, "No repository is known here. Run: dap create <name>.");
    const retained = config.invitationIssue ? await retainedIssue(ctx, config.invitationIssue) : null;
    if (config.invitationIssue && !retained) return say(1, "The retained invitation's private record is unavailable. Nothing was signed or sent.");
    if (options.mode !== "new") {
      if (!retained) return say(2, "No invitation is retained here.");
      return await finish(await issueInvitation(ctx, retained.input, { privateRequests: retained.names, mode: options.mode, operation: retained.operation }));
    }
    if (retained) return say(1, `An invitation of ${retained.input.handle} is retained. Run dap invite --check, or dap invite --continue. Nothing new was signed.`);
    if (!member) return say(2, "Name a member's handle.");
    const input: InvitationIssueInput = { kind: "person", handle: member, hours: options.hours ?? 24, ...(options.role ? { role: options.role as "member" } : {}) };
    if (!isInvitationIssueInput(input)) return say(2, "Name a handle and a role with --role: one of member, maintainer, admin.");
    return await finish(await issueInvitation(ctx, input, { privateRequests: [], mode: "new", operation: crypto.randomUUID() }));
  } catch (e) {
    const held = (await ctx.store.config().catch(() => null))?.invitationIssue !== undefined;
    return say(1, `${e instanceof Error ? e.message : "The invitation could not be completed."}${held ? " The original invitation is retained: run dap invite --check, or dap invite --continue." : " Nothing was replaced."}`);
  }
}
