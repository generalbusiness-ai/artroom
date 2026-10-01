/**
 * Building the log without a hash fixed point (review 45431cd9, P1.1;
 * R-LOG-2, R-LOG-8, R-LOG-12, R-LOG-13). Compiled, never run.
 *
 * - A new claim's entry is hashed with an `opened` effect that does not name
 *   the lane. The lane ID is derived from the sealed hash afterwards.
 * - `notify` runs after that entry is sealed. Its decisions go in a later
 *   `notified` entry, which names the claim by its now-known ID.
 * - Each log commit holds a checkpoint that names an entry hash, never a
 *   commit. The `checkpoint` event that names the commit is a later entry,
 *   published in the next commit.
 */

import type {
  ActId,
  Base64Url,
  Checkpoint,
  Decision,
  Digest,
  EntryContent,
  Lease,
  LogEntry,
  MemberId,
  Receipt,
  RoomId,
  Sha,
  SignedEnvelope,
  SigningDomain,
  Timestamp,
} from "@generalbusiness/artroom-contract";

declare function canonical(value: unknown): Uint8Array; //                    RFC 8785 bytes
declare function sha256(bytes: Uint8Array): Promise<Digest>;
declare function roomSign(domain: SigningDomain, bytes: Uint8Array): Promise<Base64Url>;
declare function utf8(text: string): Uint8Array;
declare function text(bytes: Uint8Array): string;
declare function entryId(seq: number, hash: Digest): ActId; //               act_<seq>_<hash8>
declare function evaluateNotify(entry: ActId): Promise<{ decisions: readonly Decision[]; to: readonly MemberId[] }>;
declare function commitTree(files: Readonly<Record<string, unknown>>, parent: Sha | null): Promise<Sha>;
declare const roomId: RoomId;
declare const roomKey: Checkpoint["roomKey"];
declare const now: Timestamp;

/** Seal: hash the finished content, then sign the hash. Nothing sealed is rewritten. */
async function seal(content: EntryContent): Promise<LogEntry> {
  const hash = await sha256(canonical(content));
  const roomSig = await roomSign("artroom-entry-v1", utf8(hash));
  return { ...content, hash, roomSig };
}

/** A new claim, then its notify outcome: two entries, no self-reference. */
export async function claimThenNotify(
  prev: LogEntry,
  claimAct: SignedEnvelope,
  authority: Receipt["authority"],
  lease: Lease,
): Promise<{ claim: LogEntry; lane: ActId; notified: LogEntry }> {
  const seq = prev.seq + 1;
  const receipt: Receipt = {
    outcome: "accepted",
    authority,
    decisions: [], // refuse decisions only; notify runs later
    effects: [{ type: "opened", purpose: "ordinary", lease }], // the lane is this entry: not named
    flags: [],
  };
  const claim = await seal({ format: "artroom-log-v1", seq, prev: prev.hash, at: now, entry: { type: "act", act: claimAct, receipt } });
  const lane = entryId(claim.seq, claim.hash); // derived after sealing

  // notify sees the sealed entry's ID; its outcome is a separate, later entry.
  const outcome = await evaluateNotify(lane);
  const notified = await seal({
    format: "artroom-log-v1",
    seq: claim.seq + 1,
    prev: claim.hash,
    at: now,
    entry: { type: "system", event: { type: "notified", entry: lane, decisions: outcome.decisions, to: outcome.to } },
  });
  return { claim, lane, notified };
}

/** One publication: the checkpoint names the last entry's hash, then the commit is built around it. */
async function publish(entries: readonly LogEntry[], parent: Sha | null): Promise<{ commit: Sha; through: LogEntry }> {
  const through = entries[entries.length - 1];
  if (through === undefined) throw new Error("nothing to publish");
  const unsigned = { format: "artroom-log-v1", room: roomId, through: through.seq, hash: through.hash, at: now, roomKey } as const;
  const checkpoint: Checkpoint = { ...unsigned, sig: await roomSign("artroom-checkpoint-v1", canonical(unsigned)) };
  const commit = await commitTree(
    {
      "artroom-log/v1/segments/000000000000.jsonl": entries.map((e) => text(canonical(e))).join("\n"),
      "artroom-log/v1/checkpoint.json": checkpoint,
    },
    parent,
  );
  return { commit, through };
}

/** The first two publications. Each checkpoint event is recorded after its push and published next time. */
export async function firstTwoPublications(log: LogEntry[]): Promise<readonly [Sha, Sha]> {
  const first = await publish(log, null);
  // After the push is confirmed and read back: record the event naming commit C1.
  const event1 = await seal({
    format: "artroom-log-v1",
    seq: log.length,
    prev: log[log.length - 1]!.hash,
    at: now,
    entry: { type: "system", event: { type: "checkpoint", through: first.through.seq, hash: first.through.hash, commit: first.commit } },
  });
  log.push(event1); // publishedThrough = first.through.seq

  const second = await publish(log, first.commit); // contains event1; C2's parent is C1
  return [first.commit, second.commit];
}
