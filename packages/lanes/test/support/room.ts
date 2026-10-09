/**
 * A room for the lane scenarios that run against the real platform scopes:
 * a repository founded whole on real scopes in the namespace `PLATFORM`, as
 * `packages/scope/test/founding-real.test.ts` founds one, with its members,
 * and lanes that its real directory creates under the pinned lane digests.
 *
 * | Part | Is |
 * |---|---|
 * | The register, the directory, membership, the rules scope and the destination | Real scopes: the deployed class, the production authority and the platform package's own data and rules. No rule is a stand-in. |
 * | The lanes | Real scopes under the pinned digests, created by the real directory's `open-issue` and `open-pr` after the real rules scope activated each digest. Their grants are read from the real membership scope, by the production authority. |
 * | The members | Real members of the membership scope, each with one active key of derive's fixture key set: rita, the founder and the one admin; una and vic, members; paul, a member; sam, the recovery key. |
 * | The Git host | A STAND-IN, two parts. `OutsideDouble` of the scope package is the destination's and the register's outside port: it answers what the test writes. `Host` of `graph.ts` is a lane's outside port: it answers the attempts that the code of `hold@1` opens. No repository exists and no commit is read. |
 * | The changed set of a publication | SCRIPTED: the test states the paths that the host's judge read answers with. No tree is diffed. |
 * | The clock, transport and the readers | The scripted clock, the namespace's transport, and the test readers, as in every test of the namespace `PLATFORM`. |
 * | Runner | None. W5 requires a check whose answer the test signs; no command or image runs. Other scenarios require no check. |
 */

import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Answer, DeclaredDefinition, Entry, FactRef, Intent, MemberRef, OperationId, Seed } from "@generalbusiness/artroom-contract";
import { canonicalize, factRefOf, intentDigest, keyIdOfSecret, scopeIdOf, seedDigest, signIntent, textDigest } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, declaredHandle } from "@generalbusiness/artroom-client";
import { validateDefinition, valueDigest, type ValidDefinition } from "@generalbusiness/artroom-derive";
import { keys, type Actor } from "@generalbusiness/artroom-derive/testing";
import { DESTINATION_CHANGED_SET, DIRECTORY, REGISTER, destinationReceipt, foundingObjects, repositoryName, revokedToken } from "@generalbusiness/artroom-platform";
import { targetOf } from "../../../platform/src/destination.ts";
import { SqliteStore } from "../../../scope/src/index.ts";
import { api } from "@generalbusiness/artroom-scope/worker";
import { outsideOf, wired } from "../../../scope/test/outside.ts";
import { Platform, copied, rewritten, routed, settle } from "../../../scope/test/repository.ts";
import type { Actor as Signer } from "@generalbusiness/artroom-derive/testing";
import type { Item } from "@generalbusiness/artroom-derive";
import { DIGESTS, change, issue, type changeDemo } from "../../src/index.ts";
import { Host, Node, net, reader, soon } from "./graph.ts";

export { Platform, copied, rewritten, routed, settle, soon };
export const { rita, una, vic, paul, sam } = keys;
/** A sixth test key, for a checker member: sam's key is the room's recovery key, which membership enrols for no member. */
const checkerSecret = new Uint8Array(32).fill(6);
export const checkerKey: Signer = { secret: checkerSecret, key: keyIdOfSecret(checkerSecret), member: { ...paul.member, member: "@check" as MemberRef["member"] }, principal: null };

/** A Git object ID. No repository exists here: the Git host is a stand-in. */
export const oid = (c: string) => c.repeat(40);

/** The scope service's own operations over the namespace `PLATFORM`, in the test's isolate. */
export const platformTransport = api(env.PLATFORM);

/** What the destination's outside port is asked, by kind, and what the test answers each kind with. */
type Driven = "mint" | "first-head" | "receipt" | "revoke" | "push" | "judge";

/** The validated form of a lane definition, for derive's fold of its history in `Node`. */
export function valid(definition: DeclaredDefinition): ValidDefinition {
  const checked = validateDefinition(definition, PROPOSED_BOUNDS);
  if (!checked.ok) throw new Error(`${definition.name} is refused: ${JSON.stringify(checked.problems)}`);
  return checked.definition;
}

export class Room {
  /** The changed set that the next judge read answers with, as the host would compute it: SCRIPTED. */
  changes: { paths: string[]; links: []; unreadable: number } = { paths: ["src/a.ts"], links: [], unreadable: 0 };
  /** The lanes that the directory created for this room, by name: their dispatchers run with the room's. */
  #lanes = new Map<string, Node<DeclaredDefinition>>();
  #driving = "none";

  constructor(
    readonly R: Platform, readonly D: Platform, readonly M: Platform, readonly rules: Platform, readonly G: Platform,
    readonly firstHead: string, readonly members: Record<string, number>,
  ) {}

  /** A member of the room, as a lane's slot holds one: the real membership scope's reference and the handle. */
  async member(handle: string): Promise<MemberRef> { return { membership: await this.M.at(), member: handle as MemberRef["member"] }; }

  /** Every real scope of the room and every lane it made, for the dispatchers. */
  get scopes(): Platform[] { return [this.R, this.D, this.M, this.rules, this.G, ...[...this.#lanes.keys()].map((name) => new Platform(name as never))]; }
  /** Let every dispatcher of the room carry what is due now. */
  settle(): Promise<void> { return settle(...this.scopes); }

  /**
   * Answer every recorded attempt of the destination of one kind, as the
   * STAND-IN host would, from the actual SQLite records: the request
   * context a real port reads. The answer of `judge` names the commit that
   * the publication's manifest proposes and the changed set the test set.
   */
  async drive(kind: Driven): Promise<void> {
    const host = outsideOf(this.G.name);
    const firstHead = this.firstHead;
    const changes = this.changes;
    const changed = valueDigest(DESTINATION_CHANGED_SET.domain, changes);
    const answers = await runInDurableObject(this.G.object, (_instance, state) => {
      const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
      const own = (seq: number) => { const row = store.stored(seq); return row ? { entry: JSON.parse(row.bytes) as Entry, hash: row.hash } : null; };
      const head = store.item(0)?.values["head"] as string;
      return store.all().operations.filter((operation) => operation.kind === kind).flatMap((operation) => operation.attempts.filter((attempt) => attempt.outcomes.length === 0).map((attempt) => {
        const publication = operation.for === null || operation.for === undefined ? null : store.item(operation.for);
        const integration = publication?.values["integration"] as string | undefined;
        const body = kind === "mint" ? { token: `token-${operation.id}`, ends: soon(60) }
          : kind === "revoke" ? { token: revokedToken(store, own, operation) }
          : kind === "receipt" ? { send: "accepted", seen: destinationReceipt(store, own, targetOf(store, own, operation)!, "sha1").commit }
          : kind === "first-head" ? { send: "accepted", seen: firstHead }
          : kind === "push" ? { send: "accepted", seen: integration }
          : null;
        return { operation: operation.id, attempt: attempt.attempt, body, publication: operation.for ?? null, head };
      }));
    });
    for (const answer of answers) {
      if (kind !== "judge") { host.answer(answer.operation, answer.attempt, { result: "confirmed", evidence: { basis: "own-answer", body: answer.body as never } }); continue; }
      // The judge's read: the manifest that the publication names gives its tree, base and integration commit, and the reports' commits.
      const statement = await this.statementOf(answer.publication!);
      host.answer(answer.operation, answer.attempt, {
        result: "confirmed",
        evidence: { basis: "own-answer", body: { head: answer.head, present: true, tree: statement.tree, firstParent: statement.base, ancestors: statement.reports, changes: changed } },
        retain: [{ kind: "value", domain: DESTINATION_CHANGED_SET.domain, digest: changed, bytes: canonicalize(changes) }],
      });
    }
    this.#driving = kind;
    wired.set(this.G.name, () => ({ outside: { accepts: (_owner, asked) => asked === this.#driving, send: (request) => host.send(request) } }));
    await this.G.restart();
    await (this.G.stub as unknown as { effect(): Promise<number> }).effect();
  }

  /** What the manifest that a queued publication names proposes: read from the lane's own retained entry, as a host read would see the commit. */
  async statementOf(publication: number): Promise<{ tree: string; base: string; reports: string[] }> {
    const item = await this.G.item(publication);
    const manifest = item.refs["manifest"] as { at: { scope: string }; seq: number };
    const lane = new Platform(manifest.at.scope as never);
    const entry = (await lane.entries())[manifest.seq]!;
    const fields = entry.input.type === "act" ? entry.input.signed.intent.fields : {};
    const selected = (fields["selected"] ?? []) as { report: { at: { scope: string }; seq: number } }[];
    const reports: string[] = [];
    for (const { report } of selected) {
      const reported = (await new Platform(report.at.scope as never).entries())[report.seq]!;
      reports.push((reported.input.type === "act" ? reported.input.signed.intent.fields["commit"] : null) as string);
    }
    return { tree: fields["tree"] as string, base: fields["base"] as string, reports };
  }

  /** Let the destination judge and publish every queued publication, one host answer of each kind at a time, as `founding-real` does. */
  async publish(): Promise<void> {
    await this.settle();
    await this.drive("judge");
    await this.settle();
    for (const kind of ["mint", "push", "mint", "receipt", "revoke"] as const) await this.drive(kind);
    await this.settle();
  }

  /** Activate a lane definition in the real rules scope, with its bytes beside the act. rita is the admin, who holds `rules.activate`. */
  async activate(definition: DeclaredDefinition, digest: string): Promise<void> {
    const answer = await this.rules.stub.submit(await this.rules.intent(rita, "activate", { fields: { digest, name: definition.name } }), [], { values: [canonicalize(definition)] });
    if (answer.answer !== "accepted") expect.fail(`activate ${definition.name} was not accepted: ${JSON.stringify(answer)}`);
  }

  /** Publish the rules as rita, the rules scope's controller. */
  async publishRules(fields: Record<string, unknown>): Promise<Answer> {
    return this.rules.act(rita, "publish", { on: 0, expected: await this.rules.expected({ on: 0 }), fields: fields as never });
  }

  /**
   * A lane that the real directory creates by `open-issue` or `open-pr`, for
   * `who`, under the digest that the rules scope holds `active`. The
   * definition's bytes travel beside the act. Returns the lane's node, on
   * the namespace `PLATFORM`.
   */
  async lane<const D extends DeclaredDefinition>(who: Actor, kind: "open-issue" | "open-pr", definition: D, digest: string, fields: Record<string, unknown>): Promise<Node<D>> {
    const signed = await this.D.intent(who, kind, { expected: await this.D.expected({ repository: 0 }), fields: { definition: digest, ...fields } as never });
    const seed: Seed = { v: 1, kind: "lane", definition: digest as never, creator: await this.D.at(), cause: intentDigest(signed.intent), ordinal: 0 };
    const name = scopeIdOf(seed);
    // STAND-IN: the lane's Git host, for the attempts that the code of `hold@1` opens. Wired before the object first runs.
    const host = new Host();
    wired.set(name, () => ({ outside: { accepts: (owner, kind) => host.accepts(owner, kind), send: (request) => Promise.resolve(host.send(request)) } }));
    this.#lanes.set(name, null as never);
    const answer = await this.D.stub.submit(signed, [], { values: [canonicalize(definition)] });
    if (answer.answer !== "accepted") expect.fail(`${kind} was not accepted: ${JSON.stringify(answer)}`);
    await this.settle();
    const declared = await declaredHandle(new ScopeHandle(platformTransport, name, reader), definition);
    if (!declared.ok) throw new Error(`no handle on ${name}: ${JSON.stringify(declared)}`);
    const node = new Node(declared.handle, valid(definition), env.PLATFORM);
    this.#lanes.set(name, node as never);
    return node;
  }
}

/** A report that a manifest selects, with its acceptance. */
export type Selection = { accepted: FactRef; report: FactRef };
type Lane<D extends DeclaredDefinition> = Node<D>;

/** vic's report on the issue, staged from vic's own hold under rita's offer, and rita's acceptance of it: what a manifest selects. */
export async function reported(r: Room, I: Lane<typeof issue>): Promise<Selection> {
  const filed = await I.fact(0);
  const offer = (await I.did(rita, "offer", { fields: { offeree: await r.member("@vic") } })).fact;
  await I.did(vic, "accept", { on: offer.seq, fields: { terms: filed } });
  await I.instance(vic, (await I.did(vic, "take-hold", { fields: { commitment: offer.seq } })).fact.seq);
  const report = (await I.stagedDid(vic, "report", { fields: { commitment: offer.seq, terms: filed, commit: oid("a"), tree: oid("1"), claims: ["it works"] } })).fact;
  const accepted = (await I.did(rita, "accept-report", { on: report.seq, fields: { commitment: offer.seq, terms: filed } })).fact;
  return { accepted, report };
}

/**
 * A pull request that `who` opens through the directory and integrates on the room's head: the lane asks the rules scope for
 * its rules, `who` takes a hold under a commitment to themself, proposes one version that selects `selected`, and links the
 * issue `I` to close. `definition` and `digest`: the full `change` by default, or the demo profile's. `commits`: the version's
 * base, the room's first head by default, and its integration commit.
 */
export async function proposed(
  r: Room, I: { at: Node<DeclaredDefinition>["at"] }, who: Signer, handle: string, selected: Selection[],
  definition: typeof change | typeof changeDemo = change, digest: string = DIGESTS.change, commits: { base?: string; integration?: string } = {},
): Promise<{ C: Lane<typeof change>; manifest: number }> {
  // Typed as the full definition: every act used here is a row of the profile too.
  const C = await r.lane(who, "open-pr", definition, digest, { title: "A fix", draft: false }) as unknown as Lane<typeof change>;
  await C.did(who, "ask-rules", { on: 0 });
  await r.settle();
  const offer = (await C.did(who, "offer", { fields: { offeree: await r.member(handle), terms: "Fix it." } })).fact;
  await C.did(who, "accept", { on: offer.seq, fields: { terms: offer } });
  const hold = (await C.did(who, "take-hold", { fields: { commitment: offer.seq } })).fact.seq;
  await C.instance(who, hold, "i-1");
  const manifest = (await C.stagedDid(who, "propose-manifest", { fields: { hold, instance: "i-1", base: commits.base ?? r.firstHead, integration: commits.integration ?? oid("c"), tree: oid("3"), complete: true, selected, decisions: [] } })).fact.seq;
  await C.did(who, "link-own", { fields: { issue: I.at, how: "keyword" } });
  return { C, manifest };
}

/** rita merges, and the destination judges the reservation and publishes what it reserves. Returns the merge item as the lane then holds it. */
export async function merged(r: Room, C: Lane<typeof change>, manifest: number, reports: FactRef[]): Promise<Item> {
  const merge = (await C.did(rita, "merge", { fields: { manifest, reports } })).fact.seq;
  await r.publish();
  return C.item(merge);
}

/** The destination's publication for one merge entry of a lane, found by its operation. Final items too: the summary lists live items only. */
export async function publicationOf(r: Room, C: { name: string }, merge: number): Promise<Item | null> {
  const read = await (r.G.stub as unknown as { items(reader: unknown, type: string): Promise<{ ok: boolean; value: Item[] }> }).items(reader, "publication");
  return (read.ok ? read.value : []).find((item) => { const operation = item.refs["operation"] as FactRef | undefined; return operation?.seq === merge && operation.at.scope === C.name; }) ?? null;
}

/**
 * A room: a register installed by paul, founded by rita's claim, whose
 * directory created membership, the rules scope and the destination; the
 * destination's first head and receipt written; rita seated as the one
 * admin; una, vic and paul invited as members, each with an active key.
 */
/** Fresh native enrollments; defaults retain all three members in their original order. */
type RoomMember = "@una" | "@vic" | "@paul";
export interface RoomSetup { roster?: readonly RoomMember[] }
export async function room(setup: RoomSetup = {}): Promise<Room> {
  net.hold = net.deaf = null;
  const install: Intent = { v: 1, to: null, actor: paul.key, kind: "install", on: null, expected: {}, fields: { host: "git.example", namespace: "artroom", policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
  const R = new Platform(scopeIdOf({ v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(install), ordinal: 0 }));
  // STAND-IN: the Git host of this register.
  const host = outsideOf(R.name);
  wired.set(R.name, () => ({ outside: host }));
  const installed = await R.stub.found(signIntent(install, paul.secret), REGISTER);
  if (installed.answer !== "accepted") throw new Error(`no register: ${JSON.stringify(installed)}`);
  const register = await R.at();
  const found = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } });
  const seed: Seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: register, cause: intentDigest(found.intent), ordinal: 0 };
  const D = new Platform(scopeIdOf(seed));
  host.answer("1:0" as OperationId, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(seed), 1), id: "repo-1" } } });
  const claimed = await R.stub.submit(found, []);
  if (claimed.answer !== "accepted") throw new Error(`no claim: ${JSON.stringify(claimed)}`);
  while ((await (R.stub as unknown as { effect(): Promise<number> }).effect()) > 0) { /* each pass may make the next one due */ }
  await settle(R, D);
  const sent = (await D.entries())[0]!.sends;
  const [M, rules, G] = [1, 2, 3].map((n) => new Platform(scopeIdOf(sent.find((send) => send.n === n)!.to as Seed))) as [Platform, Platform, Platform];
  await settle(R, D, M, rules, G);
  wired.delete(R.name);
  // The founding commit of `platform:destination@2`: one README that names the repository, the founder's handle and the directory.
  const readme = { name: repositoryName(seedDigest(seed), 1), handle: "@rita", directory: D.name };
  const firstHead = foundingObjects("sha1", G.name, (await G.entries())[0]!.time, factRefOf((await R.entries())[1]!), readme).commit;
  const made = new Room(R, D, M, rules, G, firstHead, {});
  for (const kind of ["mint", "first-head", "mint", "receipt", "revoke"] as const) await made.drive(kind);
  expect(await G.item(0)).toMatchObject({ state: "ready", values: { head: firstHead } });

  // Membership: rita seated on the founding key, the one admin. una, vic and paul join as members, each by an invitation of rita's.
  const seat = await M.did(rita, "seat", { expected: await M.expected({ roster: 0 }) });
  await M.did(rita, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
  made.members["@rita"] = seat;
  const roster: readonly RoomMember[] = setup.roster ?? ["@una", "@vic", "@paul"];
  for (const [who, handle] of [[una, "@una"], [vic, "@vic"], [paul, "@paul"]] as const) {
    if (!roster.includes(handle)) continue;
    const secret = `the secret of the invitation of ${handle}, of 32 bytes or more`;
    const invitation = await M.did(rita, "invite-member", { fields: { handle, role: "member", inviteHash: textDigest(secret), inviteEnds: soon(3600) } });
    await M.did(who, "join", { fields: { invitation, secret } });
    made.members[handle] = invitation;
  }
  await made.settle();
  return made;
}
