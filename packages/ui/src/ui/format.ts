/** Plain-English formatting helpers. Times are relative to the room clock, so the mock is deterministic. */

import { threadTitle } from "@generalbusiness/artroom-policy/declared";
import type { RoomSnapshot } from "../room/adapter.ts";
import type { ActId, Proposal, Timestamp } from "../room/contract.ts";

export function clock(ts: Timestamp): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts));
}

export function relative(ts: Timestamp, now: Timestamp): string {
  const mins = Math.round((Date.parse(ts) - Date.parse(now)) / 60_000);
  if (mins === 0) return "just now";
  const abs = Math.abs(mins);
  const span = abs < 60 ? `${abs} min` : `${Math.round(abs / 60)} h`;
  return mins < 0 ? `${span} ago` : `in ${span}`;
}

export const short = (sha: string) => sha.slice(0, 7);

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function laneGoal(snap: RoomSnapshot, lane: ActId | undefined): string {
  const l = snap.lanes.find((x) => x.lane === lane);
  if (!l) return "an unknown lane";
  // The one rule every reader uses (docs/protocol.md section 33.10): the goal; for a thread an application opened
  // with its own act, that act's label in force when it opened and its first text field by name, as the act's
  // declaration typed its fields then; else the thread's ID.
  const m = snap.feed.find((f) => f.id === l.lane)?.meaning;
  return threadTitle(l, m ? { meaning: m, body: Object.fromEntries(m.fields.map((f) => [f.name, f.value])) } : undefined); // G5U:thread-name
}

export function latest(snap: RoomSnapshot, lane: ActId): Proposal | undefined {
  return snap.proposals.filter((p) => p.lane === lane).at(-1);
}

export function proposalOf(snap: RoomSnapshot, lane: ActId, generation: number): Proposal | undefined {
  return snap.proposals.find((p) => p.lane === lane && p.generation === generation);
}

export function personOf(snap: RoomSnapshot, handle: string | null | undefined) {
  return snap.people.find((p) => p.handle === handle);
}

/** A rule's plain-English title, from its policy description or its ID. */
export function ruleTitle(snap: RoomSnapshot, rule: string): string {
  if (rule === "admin-approval") return "Admin approval for .artroom changes";
  const r = snap.policy.document?.rules.find((x) => x.id === rule);
  const words = rule.replace(/-/g, " ");
  return r?.description ? words.charAt(0).toUpperCase() + words.slice(1) : words;
}

export function ruleDescription(snap: RoomSnapshot, rule: string): string | undefined {
  return snap.policy.document?.rules.find((x) => x.id === rule)?.description;
}

export const join = (items: readonly string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/**
 * Entries recorded but not yet published to refs/artroom/log, from the
 * room's own counters (R-LOG-8), never from how many entries were loaded.
 */
export function unpublished(snap: RoomSnapshot): number {
  return Math.max(0, snap.log.head - snap.log.publishedThrough);
}

/** True when the only unpublished entry is the checkpoint that records the last publication. */
export function onlyCheckpointWaits(snap: RoomSnapshot): boolean {
  const last = snap.feed.at(-1);
  return unpublished(snap) === 1 && last !== undefined && last.seq === snap.log.head && last.kind === "checkpoint";
}
