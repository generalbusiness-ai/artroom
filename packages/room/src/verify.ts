/**
 * Offline checks of one published log commit (R-LOG-10). This covers the
 * structural checks: room ID, hash chain and entry IDs, every signature,
 * retained inputs, idempotency uniqueness, the checkpoint, `checkpoint`
 * events against ancestor commits, `notified` events, and R-LOG-12. It does
 * not replay the roster to re-judge each act's authority; the `artroom
 * verify` command (lane E) adds that.
 */

import type { Checkpoint, Genesis, LogEntry, Sha } from "@generalbusiness/artroom-contract";
import { canonicalize, parseStrict } from "./canonical.ts";
import { digestJson, sha256Hex, verify } from "./crypto.ts";
import { entryId, roomIdOf } from "./ids.ts";
import { utf8 } from "./canonical.ts";

export interface VerifyResult {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly through: number;
}

/**
 * Verify one commit's files. `ancestors` maps earlier log commits to their
 * files, for `checkpoint` events and unchanged full segments.
 */
export async function verifyLogFiles(files: Readonly<Record<string, string>>, ancestors: ReadonlyMap<Sha, Readonly<Record<string, string>>> = new Map()): Promise<VerifyResult> {
  const problems: string[] = [];
  const bad = (p: string) => problems.push(p);
  const genesis = parseStrict(files["artroom-log/v1/genesis.json"] ?? "null") as Genesis | null;
  const cp = parseStrict(files["artroom-log/v1/checkpoint.json"] ?? "null") as Checkpoint | null;
  if (!genesis || !cp) return { ok: false, problems: ["genesis.json or checkpoint.json is missing"], through: -1 };
  const room = roomIdOf(genesis);
  if (cp.room !== room) bad("the checkpoint names another room");
  const { sig, ...unsigned } = cp;
  if (!(await verify(genesis.roomKey, "artroom-checkpoint-v1", unsigned, sig))) bad("the checkpoint signature does not verify");

  const segments = Object.keys(files)
    .filter((k) => /^artroom-log\/v1\/segments\/\d{12}\.jsonl$/.test(k))
    .sort();
  const entries: LogEntry[] = [];
  for (const name of segments) {
    const first = Number(name.slice(-18, -6));
    if (first !== entries.length) bad(`${name} does not start at ${entries.length}`);
    for (const line of files[name]!.split("\n")) entries.push(parseStrict(line) as LogEntry);
    const lines = files[name]!.split("\n").length;
    if (lines === 1000)
      for (const [, older] of ancestors) if (older[name] !== undefined && older[name].split("\n").length === 1000 && older[name] !== files[name]) bad(`full segment ${name} changed`);
  }
  let prev: string | null = null;
  const seenIdem = new Set<string>();
  const notified = new Set<string>();
  const ids: string[] = [];
  for (const [i, e] of entries.entries()) {
    if (e.seq !== i) bad(`entry ${i} has seq ${e.seq}`);
    if (e.prev !== prev) bad(`entry ${i} does not chain to the previous hash`);
    const { hash, roomSig, ...content } = e;
    if (digestJson(content) !== hash) bad(`entry ${i}'s hash is not the digest of its content`);
    if (!(await verify(genesis.roomKey, "artroom-entry-v1", hash, roomSig))) bad(`entry ${i}'s room signature does not verify`);
    const id = entryId(e.seq, hash);
    ids.push(id);
    const x = e.entry;
    if (x.type === "system") {
      const ev = x.event;
      if (ev.type === "genesis") {
        if (i !== 0 || canonicalize(ev.genesis) !== canonicalize(genesis)) bad("entry 0 is not this genesis");
        if (!(await verify(genesis.admin.key, "artroom-genesis-v1", ev.genesis, ev.sig))) bad("the genesis signature does not verify");
      }
      if (ev.type === "notified") {
        const at = ids.indexOf(ev.entry);
        if (at < 0 || at >= i) bad(`entry ${i} notifies an entry that is not earlier`);
        if (notified.has(ev.entry)) bad(`${ev.entry} is notified twice`);
        notified.add(ev.entry);
      }
      if (ev.type === "revert-lane" && "lane" in ev) bad(`entry ${i}'s revert-lane names a lane (R-LOG-12)`);
      if (ev.type === "checkpoint") {
        const older = ancestors.get(ev.commit);
        const ocp = older ? (parseStrict(older["artroom-log/v1/checkpoint.json"]!) as Checkpoint) : null;
        if (!ocp || ocp.through !== ev.through || ocp.hash !== ev.hash) bad(`entry ${i}'s checkpoint does not name an ancestor commit with the same checkpoint`);
      }
    } else {
      const env = x.act.envelope;
      if (!(await verify(env.actor, "artroom-envelope-v1", env, x.act.sig))) bad(`entry ${i}'s envelope signature does not verify`);
      const k = `${env.actor} ${env.idempotencyKey}`;
      if (seenIdem.has(k)) bad(`entry ${i} reuses an idempotency key`);
      seenIdem.add(k);
      if (x.type === "act") for (const eff of x.receipt.effects) if (eff.type === "opened" && "lane" in eff) bad(`entry ${i}'s opened effect names a lane (R-LOG-12)`);
    }
    prev = hash;
  }
  const last = entries[entries.length - 1];
  if (!last || cp.through !== last.seq || cp.hash !== last.hash) bad("the checkpoint does not name the last entry");
  for (const [k, v] of Object.entries(files)) {
    const m = /^artroom-log\/v1\/(inputs|policies)\/([0-9a-f]{64})\.json$/.exec(k);
    if (m && sha256Hex(utf8(v)) !== m[2]) bad(`${k} does not match its digest`);
  }
  return { ok: problems.length === 0, problems, through: last?.seq ?? -1 };
}
