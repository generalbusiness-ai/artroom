/** Deterministic identifiers and clock for the mock room. */

import type { ActId, Cursor, Sha, Timestamp } from "../contract.ts";

function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const hex8 = (text: string) => fnv(text).toString(16).padStart(8, "0");

/** A 40-hex git object name derived from a label. */
export function fakeSha(label: string): Sha {
  let out = "";
  for (let i = 0; out.length < 40; i++) out += hex8(`${label}#${i}`);
  return out.slice(0, 40) as Sha;
}

export const actId = (seq: number, salt: string): ActId => `act_${seq}_${hex8(`${seq}:${salt}`)}`;

export const cursorAt = (seq: number) => `c${seq}` as Cursor;

/** The scenario starts at 09:00 UTC on the day of the plan. */
const EPOCH = Date.UTC(2026, 9, 1, 9, 0, 0);

/** Scenario minutes since 09:00, as an RFC 3339 timestamp. */
export const at = (minutes: number): Timestamp => new Date(EPOCH + Math.round(minutes * 60_000)).toISOString().replace(".000Z", "Z");

/** A key ID: never shown, present only because the contract's records carry it. */
export const fakeKey = (member: string) => `key_${(fakeSha(member) + fakeSha(member + "k")).slice(0, 43)}` as const;
