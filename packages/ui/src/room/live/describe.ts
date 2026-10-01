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
          return `A key that is evidence for a reserved landing was revoked as compromised, so the room stopped pushing it forward and recorded an abort attempt${ev.attempt.tokenRevoked ? "; the publication token was revoked" : ""}.`;
        case "publication-unresolved":
          return ev.readBack.main === "unexpected"
            ? `A publication is unresolved: main shows another writer (${ev.readBack.observed.slice(0, 7)}). The room stopped pushing and keeps the slot held until an admin reconciles main.`
            : "A publication is unresolved: main still reads as before, so the room pushes the same reserved commit forward again.";
        case "land-outcome":
          switch (ev.outcome.state) {
            case "landed":
              return `A landing completed: main is ${ev.outcome.commit.slice(0, 7)} (publication ${ev.outcome.publication}).`;
            case "aborted":
              return `Publication ${ev.outcome.publication} was aborted: it is established that it did not and cannot land.`;
            case "retryable":
              return `A landing stopped before reservation (${ev.outcome.reason}); it needs a new land.`;
            case "failed":
              return ev.outcome.reason.code === "refused"
                ? `A landing was refused by ${ev.outcome.reason.refusal.rule}: ${ev.outcome.reason.refusal.reason} Fix: ${ev.outcome.reason.refusal.fix ?? "none recorded"}`
                : ev.outcome.reason.code === "conflict"
                  ? `A landing failed: it conflicts with main on ${ev.outcome.reason.paths.join(", ")}.`
                  : "A landing failed: a required check failed on its integration.";
          }
          break;
        case "revert-lane":
          return `The room opened a revert lane (${ev.reason.replace(/-/g, " ")}).`;
        case "notified":
          return `Told ${ev.to.join(", ") || "nobody"} about an act.`;
        case "checkpoint":
          return `The log was published through entry ${ev.through}.`;
      }
    })();
    const refusal = ev.type === "land-outcome" && ev.outcome.state === "failed" && ev.outcome.reason.code === "refused" ? { ...ev.outcome.reason.refusal, act: id } : undefined;
    return { ...common, type: "system", kind: ev.type, by: null, text: text ?? ev.type, flags: [], ...(lane ? { lane } : {}), ...(refusal ? { refusal } : {}) };
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
