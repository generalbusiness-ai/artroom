/** One small set of values for every test in this package. The names and digests are made up. */

import type { DeclaredDefinition, DeliveryCause, Digest, Entry, Intent, Message, ScopeRef, Seed } from "@generalbusiness/artroom-contract";
import { keyIdOfSecret } from "../src/index.ts";

export const secret = new Uint8Array(32).fill(7);
export const otherSecret = new Uint8Array(32).fill(8);

const d = (c: string): Digest => `sha256:${c.repeat(64)}`;

export const directory: ScopeRef = { scope: `sc_${"a".repeat(52)}`, inc: `in_${"a".repeat(26)}`, kind: "directory" };

export const intent: Intent = {
  v: 1, to: directory, actor: keyIdOfSecret(secret), kind: "open-issue", on: null, expected: {},
  fields: { title: "A flaky test" }, idempotencyKey: "k1", notAfter: "2026-10-04T12:15:00Z",
};

export const seed: Seed = { v: 1, kind: "lane", definition: d("e"), creator: directory, cause: d("c"), ordinal: 0 };

export const message: Message = { class: "request", type: "create", body: { title: "A flaky test" } };

export const cause: DeliveryCause = { v: 1, from: { at: directory, seq: 5, hash: d("5") }, n: 0, message: d("b") };

export const definition: DeclaredDefinition = {
  format: "artroom-definition-1", profile: { name: "restricted", version: 1 }, capabilities: [],
  genesis: "file", items: {}, acts: {}, receives: {}, timed: {}, rules: {},
};

export const entry: Entry = {
  v: 1, at: directory, seq: 17, prev: d("6"), time: "2026-10-04T12:00:00Z", clamped: false, epoch: 0,
  input: { type: "timed", item: 3, rule: "end", due: "2026-10-04T11:59:00Z" },
  uses: [], prepared: [],
  effects: [{ effect: "state", item: 3, state: "ended" }],
  sends: [{ n: 0, to: seed, message }],
};
