/** SCRIPTED immutable facts for pure provenance and runtime-boundary tests. No factory judge ran. */
import type { Entry, ScopeRef, Seed } from "@generalbusiness/dap-contract";
import { factRefOf, intentDigest, newIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { type Fetched } from "@generalbusiness/dap-derive";
import { d, keys, T0, t } from "@generalbusiness/dap-derive/testing";
import { ISSUE_LANE_DIGESTS, PUBLISHING_LANE_DIGESTS } from "../src/publishing-provenance.ts";

export function scriptedOrigin(name: "change" | "issue" = "change", route = name === "change" ? "open-pr" : "open-issue", under = "platform:directory") {
  const ref = (kind: ScopeRef["kind"], fill: string): ScopeRef => {
    const seed: Seed = { v: 1, kind, definition: d(fill), creator: null, cause: d(fill), ordinal: 0 };
    return { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(fill.charCodeAt(0))), kind };
  };
  const directory = ref("directory", "d"), destination = ref("destination", "e");
  const definition = name === "change" ? PUBLISHING_LANE_DIGESTS[1] : ISSUE_LANE_DIGESTS[1];
  const signed = signIntent({ v: 1, to: directory, actor: keys.rita.key, kind: route, on: null, expected: {},
    fields: { definition }, idempotencyKey: "scripted-origin", notAfter: t(60) }, keys.rita.secret);
  const seed: Seed = { v: 1, kind: "lane", definition, creator: directory, cause: intentDigest(signed.intent), ordinal: 0 };
  const at: ScopeRef = { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(9)), kind: "lane" };
  const message = { class: "request", type: "create", body: { directory, fields: name === "change"
    ? { opener: keys.rita.member, title: "scripted source", draft: false, destination }
    : { opener: keys.rita.member, title: "scripted issue", conditions: [] } } } as const;
  const creator: Entry = { v: 1, at: directory, seq: 1, prev: d("0"), time: T0, clamped: false, epoch: 0,
    input: { type: "act", signed, authority: [], presented: {} }, uses: [], prepared: [], effects: [], sends: [{ n: 0, to: seed, message }] };
  const genesis: Entry = { v: 1, at, seq: 0, prev: null, time: T0, clamped: false, epoch: 0,
    input: { type: "genesis", seed, inc: at.inc, kind: name === "change" ? "open" : "file", founding: null,
      source: factRefOf(creator), n: 0, message, decision: "applied" }, uses: [], prepared: [], effects: [], sends: [] };
  const merge: Entry = { ...genesis, seq: 2, prev: factRefOf(genesis).hash,
    input: { type: "act", signed: signIntent({ v: 1, to: at, actor: keys.rita.key, kind: "merge", on: null,
      expected: {}, fields: {}, idempotencyKey: "scripted-merge", notAfter: t(60) }, keys.rita.secret), authority: [], presented: {} } };
  const origin: readonly Fetched[] = [{ fact: factRefOf(genesis), entry: genesis, under: name }, { fact: factRefOf(creator), entry: creator, under }];
  return { definition, directory, destination, at, creator, genesis, merge, origin, from: factRefOf(merge) };
}
