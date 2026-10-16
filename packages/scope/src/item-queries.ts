/** One native query operation. No legacy traversal, turn, retry or standing cache. */
import { ITEM_QUERY_WIRE_BOUNDS } from "@generalbusiness/dap-contract";
import type { ItemQuery, ItemQueryRefusal, ScopeId } from "@generalbusiness/dap-contract";
import { itemQueryArgument, readItemQueryParameter } from "@generalbusiness/artroom-bytes";
import { same, timeMs } from "@generalbusiness/dap-derive";
import { GenesisProofs, type GenesisProof } from "./genesis-proof.ts";
import { ItemQueryBudget } from "./item-query-budget.ts";
import { itemQueryPage } from "./item-query-page.ts";
import type { LocalSigners, LocalSignerProof } from "./local-signers.ts";
import { PreparationFlights, type PreparationRun } from "./preparation-flight.ts";
import { EXACT_PROOF_RECEIVER_BOUNDS, ProofBytes, type ProofSource } from "./proof-bytes.ts";
import type { Clock } from "./ports.ts";
import type { PreparedRead, ReadPreparation } from "./read-preparation.ts";
import { preparedSessionRefusal, sessionAllowsVisibility, type QueryVisibility, type SessionPreparation } from "./session-preparation.ts";
import { authenticateSession, type Sessions } from "./sessions.ts";
import { checkSignedReadRequest, leads, presentsSignedRead, scopedSignedRead } from "./signed-reads.ts";
import type { Sql } from "./sqlite.ts";

export type NativeItemQuery = { ok: true; serialized: string } | { ok: false; reason: ItemQueryRefusal };
const no = (reason: ItemQueryRefusal): NativeItemQuery => ({ ok: false, reason });
interface Selection { visibility: QueryVisibility; refused: ItemQueryRefusal | null }
function selection(frame: PreparedRead, query: ItemQuery): Selection {
  if (!same(frame.scope.at, query.scope)) return { visibility: "empty", refused: "wrong-scope" };
  const types = frame.pinned.definition?.declared.items;
  if (!types) return { visibility: "empty", refused: "query-not-ready" };
  if (!Object.hasOwn(types, query.type)) return { visibility: "empty", refused: "unknown-type" };
  const states = types[query.type]!.states;
  if (query.states.some(state => !Object.hasOwn(states, state))) return { visibility: "empty", refused: "unknown-state" };
  const finals = query.states.filter(state => states[state]!.final).length;
  return { visibility: query.states.length === 0 ? "empty" : finals === 0 ? "live" : finals === query.states.length ? "final" : "mixed", refused: null };
}
export interface ItemQueriesConfig {
  name: ScopeId | null;
  sql: Pick<Sql, "exec">;
  preparation: ReadPreparation;
  sessionPreparation: SessionPreparation;
  localSigners: Pick<LocalSigners, "proof">;
  proofs: ProofSource | null;
  sessions(): Sessions | null;
  clock: Clock;
  window: number;
  flights: PreparationFlights;
}

export class ItemQueries {
  constructor(readonly config: ItemQueriesConfig) {}
  read(encoded: unknown, reader: unknown): Promise<NativeItemQuery> {
    return this.config.flights.run(run => this.#run(encoded, reader, run)).then(result => result ?? no("unavailable"));
  }
  async #run(encoded: unknown, reader: unknown, run: PreparationRun): Promise<NativeItemQuery> {
    const { config } = this;
    if (typeof encoded !== "string") return no("invalid-query");
    if (encoded.length > ITEM_QUERY_WIRE_BOUNDS.encodedChars) return no("too-large");
    const query = readItemQueryParameter(encoded);
    if (!query || !config.name || query.scope.scope !== config.name) return no("invalid-query");
    if (typeof reader !== "string" || reader.length > ITEM_QUERY_WIRE_BOUNDS.sessionChars) return no("forbidden");
    const signed = presentsSignedRead(reader), budget = new ItemQueryBudget(signed ? "signed" : "session", run.active);
    if (!signed) {
      const authentic = authenticateSession(config.sessions, reader);
      if (!("claims" in authentic)) return no(authentic.refused || "forbidden");
      const reading = timeMs(config.clock.read()), ends = timeMs(authentic.claims.ends);
      if (reading === null) return no("forbidden");
      if (ends === null || reading >= ends) return no("forbidden");
      if (!sessionAllowsVisibility(authentic.claims.reads, "empty")) return no("forbidden");
      const result = await config.sessionPreparation.prepare(reader, frame => selection(frame, query).visibility, run, budget.preparation("preparation"), () => {
        budget.spend("preparation", { rpcs: 1 }); budget.reservePeerPreparation();
      });
      if (!run.active() || !budget.available) return no("unavailable");
      if (!result.ok) return no(result.reason);
      const { prepared } = result;
      return this.#tail(prepared.frame, query, selection(prepared.frame, query), run, budget, () =>
        preparedSessionRefusal(config, prepared.frame, reader, prepared.visibility, prepared.membership, prepared.resolvedBirth));
    }
    const argument = itemQueryArgument(query);
    const admitted = argument && scopedSignedRead(reader, config.name, "query-items", argument);
    if (!argument || !admitted) return no("forbidden");
    const reading = timeMs(config.clock.read()), ends = timeMs(admitted.request.notAfter);
    if (reading === null) return no("forbidden");
    if (ends === null || ends <= reading || ends - reading > config.window * 1000) return no("forbidden");
    const frame = config.preparation.capture(budget.preparation("preparation"));
    if (!frame || !run.active()) return no("unavailable");
    // This configuration deliberately has no legacy Chains or diagnostic callback.
    const signing = { clock: config.clock, window: config.window };
    const checked = checkSignedReadRequest(signing, { scope: () => frame.scope }, reader, "query-items", argument);
    // No state-specific clock reason before scoped signer/root evidence.
    if (!("key" in checked)) return no("forbidden");
    const local: LocalSignerProof = config.localSigners.proof(checked.key, checked.since, {
      call: metadata => budget.spend("signer", { calls: 1, metadata }),
      body: historyBytes => budget.spend("signer", { historyBodies: 1, historyBytes }),
    });
    let root: GenesisProof = { kind: "unknown" };
    if (local.state !== "positive") {
      budget.spend("causal", { historyBodies: 16, historyBytes: 1024 * 1024 });
      const proof = new GenesisProofs(new ProofBytes(budget.sql("causal", config.sql, 4096)), config.proofs);
      root = await proof.owned({ at: frame.scope.at, seq: 0, hash: frame.scope.genesis.hash }, run, {
        attempt: () => budget.spend("causal", { attempts: 1 }), visit: () => budget.spend("causal", { visits: 1 }),
        peer: () => budget.spend("causal", { rpcs: 1, calls: EXACT_PROOF_RECEIVER_BOUNDS.calls, metadata: EXACT_PROOF_RECEIVER_BOUNDS.metadata }),
      });
    }
    if (!run.active() || !budget.available) return no("unavailable");
    const guard = (): ItemQueryRefusal | null => {
      // Establish scope authority before disclosing a changed clock. The
      // fresh check below still applies the current request window.
      if (!(local.state === "positive" && (timeMs(local.time) ?? -Infinity) >= checked.since
        || root.kind === "root" && leads(root.root, checked.key, checked.since))) {
        return local.state === "unknown" || root.kind === "unknown" ? "unavailable" : "forbidden";
      }
      const fresh = checkSignedReadRequest(signing, { scope: () => frame.scope }, reader, "query-items", argument);
      if (!("key" in fresh) || fresh.key !== checked.key) return "refused" in fresh && fresh.refused === "clock-behind" ? "clock-behind" : "forbidden";
      if (local.state === "positive" && (timeMs(local.time) ?? -Infinity) >= fresh.since || root.kind === "root" && leads(root.root, fresh.key, fresh.since)) return null;
      return local.state === "unknown" || root.kind === "unknown" ? "unavailable" : "forbidden";
    };
    const selected = selection(frame, query);
    const scoped = guard();
    if (scoped !== null) return no(scoped);
    if (selected.visibility === "final" || selected.visibility === "mixed") return no("forbidden");
    return this.#tail(frame, query, selected, run, budget, guard);
  }
  #tail(frame: PreparedRead, query: ItemQuery, selected: Selection, run: PreparationRun, budget: ItemQueryBudget, guard: () => ItemQueryRefusal | null): NativeItemQuery {
    if (!run.active() || !budget.available || !frame.current() || !run.active()) return no("unavailable");
    const prepared = guard();
    if (prepared !== null) return no(prepared);
    if (selected.refused !== null) return no(selected.refused);
    const page = itemQueryPage(budget.sql("page", this.config.sql), frame, query, () => budget.available, {
      candidates: (candidates, metadata) => budget.spend("page", { candidates, metadata }),
      bodies: (bodies, payloadBytes) => budget.spend("page", { bodies, payloadBytes }),
    });
    if (!run.active() || !budget.available) return no("unavailable");
    // LAST authority check. No storage/support phase, callback, await or write follows it.
    const final = guard();
    return final === null ? page : no(final);
  }
}
