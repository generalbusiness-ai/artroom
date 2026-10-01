/** Plain sentences for log entries from a live room. */

import type { ActId, LogEntry } from "../contract.ts";
import type { FeedEntry } from "../adapter.ts";

/** `act_<seq>_<first 8 hex of the entry hash>` (R-ID-1). */
export const entryId = (e: LogEntry): ActId => `act_${e.seq}_${e.hash.slice("sha256:".length, "sha256:".length + 8)}`;

export function describeEntry(e: LogEntry): FeedEntry {
  const id = entryId(e);
  const common = { id, seq: e.seq, at: e.at };
  const x = e.entry;
  if (x.type === "system") {
    const ev = x.event;
    const lane = "lane" in ev ? ev.lane : undefined;
    const text = (() => {
      switch (ev.type) {
        case "genesis":
          return `The room ${ev.genesis.name} was created.`;
        case "lease-expired":
          return `${ev.holder}'s lease expired. There is no handover note.`;
        case "policy-activated":
          return `A new policy became active. ${ev.recomputed.reopened} obligations reopened.`;
        case "land-reserved":
          return `A landing was reserved: publication ${ev.publication}.`;
        case "abort-attempt":
          return "The room tried to abort a publication after a key was reported compromised.";
        case "publication-unresolved":
          return "A publication is unresolved. The room keeps pushing the same commit forward.";
        case "land-outcome":
          return `A landing ended: ${ev.outcome.state}.`;
        case "revert-lane":
          return "The room opened a revert lane.";
        case "notified":
          return `Told ${ev.to.join(", ") || "nobody"} about an act.`;
        case "checkpoint":
          return `The log was published through entry ${ev.through}.`;
      }
    })();
    return { ...common, type: "system", kind: ev.type, by: null, text, flags: [], ...(lane ? { lane } : {}) };
  }
  const env = x.act.envelope;
  const by = x.receipt.authority.member;
  const lane = env.target && typeof env.target === "object" && "lane" in env.target ? env.target.lane : undefined;
  if (x.type === "refusal") {
    const r = x.receipt.refusal;
    return { ...common, type: "refusal", kind: env.kind, by, text: `${by ?? "Someone"}'s ${env.kind} was refused: ${r.rule}.`, refusal: { ...r, act: id }, flags: [], ...(lane ? { lane } : {}) };
  }
  const text = (() => {
    switch (env.kind) {
      case "claim":
        return "goal" in env.body && env.body.goal ? `${by} claimed “${env.body.goal}”.` : `${by} changed a claim.`;
      case "propose":
        return `${by} proposed a new generation.`;
      case "note":
        return `${by} wrote a note.`;
      case "review":
        return `${by} ${env.body.verdict === "approve" ? "approved" : "objected to"} generation ${env.target.generation}.`;
      case "check":
        return `${by} ran ${env.body.check}: ${env.body.ok ? "passed" : "failed"}.`;
      case "land":
        return `${by} asked to land generation ${env.target.generation}.`;
      case "release":
        return `${by} released a lane.`;
      case "renew":
        return `${by} renewed a lease.`;
      case "roster":
        return `${by ?? "The recovery key"} changed the roster (${env.body.op}).`;
    }
  })();
  return {
    ...common,
    type: "act",
    kind: env.kind,
    by,
    text,
    flags: x.receipt.flags,
    ...(lane ? { lane } : {}),
    ...(x.receipt.after ? { after: x.receipt.after } : {}),
  };
}
