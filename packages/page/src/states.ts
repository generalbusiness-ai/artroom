/**
 * The states that plan 016 asks a page to tell apart for a change, each
 * from what the room records or what the scope last answered. Nothing here
 * judges a rule: each state names a record and says what it is.
 *
 * | State | Read from |
 * |---|---|
 * | waiting for a reviewer | An open review request on the change, while no merge is published. |
 * | unavailable authority | The last answer was `unavailable`, or a refusal for a dependency that could not be read; or the latest merge was not reserved because the destination could not observe the merger's authority (`authority-lost`). |
 * | policy not met | The latest merge was not reserved, `rules-not-met`, with the extents the destination names; or the last answer was the lane's refusal `approvals-needed`. |
 * | publication in progress | The latest merge is `intended`, `committed` or `unknown`, or its publication is not final. |
 * | publication confirmed | The latest merge is `published`. |
 * | effect queued, unknown, confirmed, refused | Each outside operation of the latest merge's publication, by the result of its last attempt: none yet, or only opened, is queued. |
 */

import type { Answer } from "@generalbusiness/artroom-contract";
import type { ChangeView } from "./data.ts";

export type ChangeStateName =
  | "waiting for a reviewer" | "unavailable authority" | "policy not met" | "publication in progress" | "publication confirmed"
  | "effect queued" | "effect unknown" | "effect confirmed" | "effect refused";

export interface ChangeState { state: ChangeStateName; detail: string }

/** Refusals whose reason is that something the scope needed could not be read, not that the caller lacks a grant. */
const UNAVAILABLE = ["dependency-unavailable", "sessions-unavailable"];

/** The states of a change, in the order of plan 016's list. `last`: the scope's answer to the act the person sent last, if any. */
export function changeStates(view: Pick<ChangeView, "requests" | "merges">, last: Answer | null = null): ChangeState[] {
  const states: ChangeState[] = [];
  const latest = view.merges.length > 0 ? view.merges.reduce((a, b) => (b.id > a.id ? b : a)) : null;
  const published = view.merges.some((merge) => merge.state === "published");

  if (!published) {
    for (const request of view.requests.filter((r) => r.state === "open")) {
      states.push({ state: "waiting for a reviewer", detail: `${request.requested ?? "A member"} is asked to review, by ${request.requester ?? "a member"} (request ${request.id}).` });
    }
  }

  if (last?.answer === "unavailable") states.push({ state: "unavailable authority", detail: `The scope could not judge the last act now: ${last.reason}. Nothing was written; the same act may be sent again.` });
  if (last?.answer === "refused" && UNAVAILABLE.includes(last.reason)) states.push({ state: "unavailable authority", detail: `The last act was refused: ${last.reason}. Nothing was written.` });
  if (latest?.state === "refused" && latest.reason === "authority-lost") {
    states.push({ state: "unavailable authority", detail: `Merge ${latest.id} was not reserved: the destination did not observe the merger's authority within its window (authority-lost).` });
  }

  if (latest?.state === "refused" && latest.reason?.startsWith("rules-not-met")) {
    const named = latest.reason.slice("rules-not-met".length + 1);
    states.push({
      state: "policy not met",
      detail: named ? `Merge ${latest.id} was not reserved: the rules are not met for the extent${named.includes(",") ? "s" : ""} ${named.split(",").join(", ")}.` : `Merge ${latest.id} was not reserved: a changed path is in no extent of the rules.`,
    });
  }
  if (last?.answer === "refused" && "name" in last && last.name === "approvals-needed") {
    states.push({ state: "policy not met", detail: "The lane refused the merge: its copy of the rules needs more approvals of this version (approvals-needed). Nothing was written." });
  }

  if (latest && (["intended", "committed", "unknown"].includes(latest.state) || (latest.publication && !["published", "aborted", "not-reserved"].includes(latest.publication.state)))) {
    states.push({ state: "publication in progress", detail: `Merge ${latest.id} is ${latest.state}${latest.publication ? `; the destination's publication ${latest.publication.id} is ${latest.publication.state}` : ""}.` });
  }
  if (latest?.state === "published") states.push({ state: "publication confirmed", detail: `Merge ${latest.id} is published${latest.commit ? ` at ${latest.commit.slice(0, 12)}` : ""}.` });

  for (const operation of latest?.publication?.operations ?? []) {
    const result = operation.attempts.at(-1) ?? null;
    const state: ChangeStateName = result === "confirmed" ? "effect confirmed" : result === "refused" ? "effect refused" : result === "unknown" ? "effect unknown" : "effect queued";
    states.push({ state, detail: `${operation.kind}, operation ${operation.id}, ${operation.attempts.length === 0 ? "no attempt yet" : `attempt ${operation.attempts.length}: ${result}`}.` });
  }
  return states;
}
