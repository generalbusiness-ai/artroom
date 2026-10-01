/**
 * One place that says what a landing operation's state means, from the
 * recorded facts only (docs/protocol.md R-LAND, R-PUB-5, R-PUB-6, R-REV-5,
 * R-REV-6). The Room, Proposal and Needs you screens all use it.
 */

import type { ComponentChildren } from "preact";
import type { RoomSnapshot } from "../room/adapter.ts";
import type { AbortAttempt, LandOp, RetryReason } from "../room/contract.ts";
import { recoveryNow } from "../room/recovery.ts";
import { RefusalNotice, Sha, WhyLink } from "./bits.tsx";
import { useApp } from "./context.ts";
import { clock, laneGoal } from "./format.ts";
import { href } from "./router.ts";

const RETRY: Record<RetryReason, string> = {
  "generation-moved": "A newer generation was proposed before the landing was reserved.",
  "lease-changed": "The lane's lease changed before the landing was reserved.",
  released: "The lane was released before the landing was reserved.",
  "authority-lost": "The member who asked to land no longer has the authority to.",
  "evidence-invalid": "Evidence it relied on no longer counts.",
  "obligation-open": "An obligation was open when the room checked again.",
};

export interface LandingFacts {
  /** One plain sentence: what is happening now. */
  readonly summary: string;
  /** Further recorded facts, each one sentence. */
  readonly facts: readonly ComponentChildren[];
  /** Is this state waiting on an admin? */
  readonly needsAdmin: boolean;
}

function abortFacts(abort: AbortAttempt): ComponentChildren[] {
  return [
    <>
      A key that is evidence for this landing was revoked as compromised (entry {abort.at}), so the room recorded an abort attempt and stopped pushing forward.
    </>,
    abort.tokenRevoked ? <>The publication token was revoked.</> : <>The room has not confirmed that the publication token was revoked.</>,
  ];
}

/** What the recorded state of a landing operation means. */
export function landingFacts(snap: RoomSnapshot, op: LandOp): LandingFacts {
  const none = { facts: [], needsAdmin: false };
  switch (op.state) {
    case "accepted":
      return { summary: "Accepted. Waiting to prepare.", ...none };
    case "preparing":
      return {
        summary: op.attempts > 1 ? `Main moved, so it is building and checking a new integration commit (attempt ${op.attempts}).` : "Building the integration commit and running the required checks.",
        facts: op.waiting.length ? [<>Waiting for {op.waiting.join(", ")} on this integration.</>] : [],
        needsAdmin: false,
      };
    case "ready":
      return {
        summary:
          snap.slot === null
            ? "Checked and ready. Whether the publication slot is free is not known here."
            : snap.slot.state === "held" && snap.slot.op !== op.id
              ? "Checked and ready. Waiting for the publication slot."
              : "Checked and ready. Next it reserves the publication slot.",
        ...none,
      };
    case "publishing":
      return {
        summary: `Reserved at entry ${op.reservedAt}, so this landing is decided. Pushing ${op.integration.slice(0, 7)} to main.`,
        facts: [<>The push replaces main only if main is still {op.expectedMain.slice(0, 7)}. Push attempts so far: {op.pushes}.</>],
        needsAdmin: false,
      };
    case "unresolved": {
      const since = <>Unresolved since {clock(op.since)}. The slot stays held; it is never released on a timer.</>;
      if (op.abort) {
        const read =
          op.readBack.main === "unexpected" ? (
            <>
              Main reads <Sha sha={op.readBack.observed} />, which is neither the expected main nor this landing's commit. An admin must reconcile main.
            </>
          ) : (
            <>Main still reads as the expected main: the push has not landed so far.</>
          );
        return {
          summary: recoveryNow(op),
          facts: [
            ...abortFacts(op.abort),
            read,
            <>If main turns out to be this landing's commit, the room records it as landed and opens a revert lane. It records it as aborted only once it is established that the push did not and cannot land.</>,
            since,
          ],
          needsAdmin: true,
        };
      }
      if (op.readBack.main === "unexpected")
        return {
          summary: recoveryNow(op),
          facts: [
            <>
              Main reads <Sha sha={op.readBack.observed} />: neither the expected main <Sha sha={op.expectedMain} /> nor this landing's commit <Sha sha={op.integration} />.
            </>,
            <>No later landing can publish until this is resolved.</>,
            since,
          ],
          needsAdmin: true,
        };
      return {
        summary: recoveryNow(op),
        facts: [
          <>
            Main reads the expected main <Sha sha={op.expectedMain} />; the push of <Sha sha={op.integration} /> has not landed yet.
          </>,
          since,
        ],
        needsAdmin: true,
      };
    }
    case "landed": {
      if (!op.abort) return { summary: `Landed: main is ${op.integration.slice(0, 7)} (publication ${op.publication}).`, ...none };
      const revert = op.revertLane;
      return {
        summary: `Landed despite an abort attempt: main is ${op.integration.slice(0, 7)} (publication ${op.publication}).`,
        facts: [
          ...abortFacts(op.abort),
          revert ? (
            <>
              The room opened a revert lane: <a href={href.proposal(revert)}>{laneGoal(snap, revert)}</a>.
            </>
          ) : (
            <>The room has not recorded a revert lane yet.</>
          ),
        ],
        needsAdmin: true,
      };
    }
    case "aborted":
      return {
        summary: `Aborted: it is established that publication ${op.publication} did not and cannot land. The slot is free again.`,
        facts: abortFacts(op.abort),
        needsAdmin: false,
      };
    case "retryable":
      return { summary: `Stopped before reservation. ${RETRY[op.reason]}`, facts: [<>Fix: {op.fix}</>], needsAdmin: false };
    case "failed":
      switch (op.reason.code) {
        case "conflict":
          return {
            summary: `Failed: the change conflicts with main on ${op.reason.paths.join(", ")}.`,
            facts: [<>The holder recuts it on main as a new generation, then asks to land again.</>],
            needsAdmin: false,
          };
        case "check-failed":
          return { summary: "Failed: a required check failed on the integration commit.", facts: [<WhyLink act={op.reason.check}>The failed check</WhyLink>], needsAdmin: false };
        case "refused":
          return { summary: "Failed: the room refused the landing.", facts: [<RefusalNotice refusal={op.reason.refusal} title="Refused" />], needsAdmin: false };
      }
  }
}

/** The facts of one landing, as a block of text. */
export function LandingDetail({ op }: { op: LandOp }) {
  const { snap } = useApp();
  const f = landingFacts(snap, op);
  return (
    <div class="stack-sm" data-landing-detail={op.state}>
      <p class="small">{f.summary}</p>
      {f.facts.length > 0 && (
        <ul class="stack-sm small muted">
          {f.facts.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
