/**
 * Loading the declared-acts fixtures (test/fixtures/declared-*.json) and
 * forging variants of them. A log is published as one log commit, with a
 * checkpoint signed by the room key, to a fresh repository: a fresh clone,
 * with or without the room's repository objects (proposed heads and their
 * bases). A forged variant changes the entries or retained files, then
 * reseals every entry from the first one it changed with the room key, so
 * the log stays room-signed and differs only in the way its test names.
 */

import type { Decision, Genesis, LogEntry, PolicyDocument, ReplayContext } from "@generalbusiness/artroom-contract";
import { replay } from "@generalbusiness/artroom-policy";
import { canonicalize, parseStrict, utf8 } from "../../src/canonical.ts";
import { sha256Hex, sign, unb64url, type KeyPair } from "../../src/crypto.ts";
import { contentOf, logFiles, makeCheckpoint, retain, roomIdOf, seal, type Retained } from "../../src/entries.ts";
import { MemoryGit } from "../../src/git.ts";
import { verifyLog, type VerifyOptions } from "../../src/verify.ts";
import { keys } from "./room-sim.ts";
import type { Fixture } from "./declared-room.ts";
import { publishFiles } from "./logs.ts";

/** A fixture's log, ready to change. */
export interface Log {
  entries: LogEntry[];
  retained: Retained[];
  readonly repo: Fixture["repo"];
}

export function open(f: Fixture): Log {
  return { entries: f.entries.map((l) => parseStrict(l) as LogEntry), retained: [...f.retained], repo: f.repo };
}

/** Publish `log` as one log commit to a fresh repository; with `repo` (the default), the room's objects are there too. */
export async function publish(log: Log, opts: { readonly repo?: boolean } = {}): Promise<MemoryGit> {
  const git = new MemoryGit();
  if (opts.repo !== false) for (const [sha, o] of Object.entries(log.repo)) git.objects.set(sha, { type: o.type, data: unb64url(o.data)! });
  const genesis = (log.entries[0]!.entry as { event: { genesis: Genesis } }).event.genesis;
  const last = log.entries.at(-1)!;
  const cp = makeCheckpoint(roomIdOf(genesis), keys.room.key, keys.room.seed, last, last.at);
  return publishFiles(logFiles(log.entries, log.retained, cp), git);
}

export async function verify(log: Log, opts: { readonly repo?: boolean } & VerifyOptions = {}) {
  return verifyLog(await publish(log, opts), opts);
}

/** Reseal entries from `from` on with the room key, fixing seq, prev and hash. */
export function reseal(log: Log, from: number): void {
  for (let i = from; i < log.entries.length; i++) {
    const c = contentOf(log.entries[i]!);
    log.entries[i] = seal({ ...c, seq: i, prev: i === 0 ? null : log.entries[i - 1]!.hash }, keys.room.seed);
  }
}

/** The entry at `seq`, as an act or refusal; throws otherwise. */
export function actAt(log: Log, seq: number) {
  const e = log.entries[seq]!.entry;
  if (e.type === "system") throw new Error(`entry ${seq} is a system event`);
  return e;
}

/** The retained context a decision names. */
export function contextOf(log: Log, d: Decision): ReplayContext {
  const r = log.retained.find((x) => x.kind === "input" && `sha256:${sha256Hex(utf8(x.body))}` === d.input);
  if (!r) throw new Error(`no retained context ${d.input}`);
  return parseStrict(r.body) as ReplayContext;
}

/** Retain a (forged) context and return its digest. */
export function keep(log: Log, context: unknown): Decision["input"] {
  const r = retain("input", context);
  log.retained.push(r);
  return `sha256:${sha256Hex(utf8(r.body))}`;
}

/** Replace the receipt of the act at `seq` (keeping its envelope), and reseal from there. */
export function withReceipt(log: Log, seq: number, change: (r: Record<string, unknown>) => Record<string, unknown>): void {
  const e = actAt(log, seq);
  const c = contentOf(log.entries[seq]!);
  log.entries[seq] = { ...log.entries[seq]!, ...c, entry: { ...e, receipt: change({ ...e.receipt }) } as never };
  reseal(log, seq);
}

/** Replace the envelope of the act at `seq`, signed again by `signer`, and reseal from there. */
export function withEnvelope(log: Log, seq: number, signer: KeyPair, change: (env: Record<string, unknown>) => Record<string, unknown>): void {
  const e = actAt(log, seq);
  const envelope = change({ ...(e.act.envelope as unknown as Record<string, unknown>) });
  const c = contentOf(log.entries[seq]!);
  log.entries[seq] = { ...log.entries[seq]!, ...c, entry: { ...e, act: { envelope, sig: sign(signer.seed, "artroom-envelope-v1", envelope) } } as never };
  reseal(log, seq);
}

/** Insert `entry` content at `seq`, shifting later entries, and reseal from there. */
export function insert(log: Log, seq: number, entry: LogEntry["entry"]): void {
  const at = log.entries[seq]?.at ?? log.entries.at(-1)!.at;
  log.entries.splice(seq, 0, { format: "artroom-log-v1", seq, prev: null, at, entry, hash: "sha256:", roomSig: "" } as unknown as LogEntry);
  reseal(log, seq);
}

/** The decisions an entry records: an act's or refusal's receipt, or a system event's. */
export function decisionsAt(log: Log, seq: number): Decision[] {
  const e = log.entries[seq]!.entry;
  return e.type === "system" ? [...((e.event as { decisions?: Decision[] }).decisions ?? [])] : [...e.receipt.decisions];
}

/** Replace the decisions an entry records, and reseal from there. */
export function setDecisions(log: Log, seq: number, decisions: readonly Decision[]): void {
  const e = log.entries[seq]!.entry;
  if (e.type === "system") {
    log.entries[seq] = { ...log.entries[seq]!, entry: { type: "system", event: { ...(e.event as object), decisions } as never } };
    reseal(log, seq);
  } else withReceipt(log, seq, (r) => ({ ...r, decisions }));
}

/** The policy document a version names: the one its `policy-activated` entry retained. */
export function policyOf(log: Log, version: string): PolicyDocument {
  const e = log.entries[Number(version.split("_")[1])]!.entry;
  if (e.type !== "system" || e.event.type !== "policy-activated") throw new Error(`${version} is not a policy-activated entry`);
  const digest = e.event.policy;
  const r = log.retained.find((x) => x.kind === "policy" && `sha256:${sha256Hex(utf8(x.body))}` === digest)!;
  return parseStrict(r.body) as PolicyDocument;
}

/**
 * Forge one recorded call of the entry at `seq`, as a room that lies about
 * what it asked would: the `nth` call of `kind` gets the context `change`
 * returns, the evaluator is run on that context, and the entry records the
 * decisions it gives, with the forged context retained. The forged call
 * replays consistently; only a context rebuilt from the log shows it false.
 */
export async function forgeCall<K extends ReplayContext["kind"]>(
  log: Log,
  seq: number,
  kind: K,
  change: (context: Extract<ReplayContext, { readonly kind: K }>) => unknown,
  nth = 0,
): Promise<void> {
  const recorded = decisionsAt(log, seq);
  const digests = [...new Set(recorded.filter((d) => d.kind === kind).map((d) => d.input))];
  const digest = digests[nth];
  if (!digest) throw new Error(`entry ${seq} records no ${kind} call ${nth}`);
  const first = recorded.find((d) => d.input === digest)!;
  const forged = change(structuredClone(contextOf(log, first)) as Extract<ReplayContext, { readonly kind: K }>) as ReplayContext;
  const r = await replay({ doc: policyOf(log, first.policy), version: first.policy }, forged);
  for (const e of r.evaluations) keep(log, e.context);
  const made = r.evaluations.map((e) => e.decision);
  let placed = false;
  setDecisions(
    log,
    seq,
    recorded.flatMap((d) => {
      if (d.input !== digest) return [d];
      if (placed) return [];
      placed = true;
      return made;
    }),
  );
}

export const canonical = canonicalize;
