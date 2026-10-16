/** Bounded private content and state preparation. No read authority here. */
import { DOMAINS } from "@generalbusiness/dap-contract";
import type { Digest, Input, PlatformDefinition } from "@generalbusiness/dap-contract";
import { canonicalize, definitionDigest, digestBytes, domainBytes, isDigest, isPlatformDefinition, utf8, wellFormed } from "@generalbusiness/artroom-bytes";
import { same, type ScopeState, type ValidDefinition } from "@generalbusiness/dap-derive";
import { platform as exactPlatform } from "@generalbusiness/dap-platform";
import type { Pinned, Supplied } from "./core.ts";
import { PREPARATION_BOUNDS as B, PreparationBudget } from "./preparation-budget.ts";
import { preparationScope } from "./preparation-scope.ts";
import { preparationView } from "./preparation-view.ts";
import { ProofBytes, proofEntry } from "./proof-bytes.ts";
import type { Sql } from "./sqlite.ts";

/** Native pure support callbacks, specifically Scope.validate/platform.
 * policy is a bounded validator/capability/runtime-bounds version. Support
 * runs again on every capture/revalidation; it is not cached standing. */
export interface PreparationSupport {
  policy(): string;
  declared(bytes: string): ValidDefinition | null;
  platform(named: PlatformDefinition): Supplied | null;
}
type Genesis = Extract<Input, { type: "genesis" }>;

export class PreparedRead {
  readonly scope: ScopeState;
  readonly genesis: Genesis;
  readonly budget: PreparationBudget;
  readonly view: ReturnType<typeof preparationView>;
  readonly #sql: Pick<Sql, "exec">;
  readonly #support: () => Pinned | null;
  #pinned: Pinned;
  constructor(sql: Pick<Sql, "exec">, scope: ScopeState, genesis: Genesis, pinned: Pinned, budget: PreparationBudget, support: () => Pinned | null) {
    this.#sql = sql; this.scope = scope; this.genesis = genesis; this.#pinned = pinned; this.budget = budget; this.#support = support;
    this.view = preparationView(sql, scope, budget);
  }
  get pinned(): Pinned { return this.#pinned; }
  /** A changed head requires a new operation, never a restarted allowance.
   * The caller repeats fresh authentication after this last storage phase. */
  current(): boolean {
    try {
      const current = preparationScope(this.#sql, this.budget);
      if (current.kind !== "scope" || !same(current.scope, this.scope)) { this.budget.invalidate(); return false; }
      const supported = this.#support();
      if (!supported || !this.budget.available) { this.budget.invalidate(); return false; }
      this.#pinned = supported; return true;
    } catch { this.budget.invalidate(); return false; }
  }
}

export class ReadPreparation {
  readonly #sql: Pick<Sql, "exec">;
  readonly #support: PreparationSupport;
  // One validated immutable raw declaration, never genesis/claims/standing.
  #content: { id: string; bytes: string } | null = null;
  constructor(sql: Pick<Sql, "exec">, support: PreparationSupport) { this.#sql = sql; this.#support = support; }
  #policy(budget: PreparationBudget): string {
    budget.spend({ calls: 1, metadata: 256 });
    const policy = this.#support.policy();
    if (typeof policy !== "string" || !policy.length || policy.length > 256 || !wellFormed(policy) || utf8(policy).length > 256) return budget.stop();
    return policy;
  }
  #pin(named: Digest | PlatformDefinition, raw: string | null, budget: PreparationBudget): Pinned | null {
    budget.spend({ calls: 1 }); // cached content still spends validation work
    if (isPlatformDefinition(named)) {
      const coded = exactPlatform(named), supplied = coded ? this.#support.platform(named) : null;
      const expected = coded ? digestBytes(domainBytes(DOMAINS.definition, coded.data)) : null;
      // The current closed catalog is exact. A name/prefix alias or a
      // modified injected platform declaration cannot stand in for it.
      return coded && supplied && supplied.definition.digest === expected && definitionDigest(supplied.definition.declared) === expected
        && supplied.platform.named === named && supplied.platform.rules === coded.rules
        ? { named, definition: supplied.definition, platform: supplied.platform } : null;
    }
    if (!isDigest(named) || raw === null) return null;
    const definition = this.#support.declared(raw);
    return definition && definition.digest === named && definitionDigest(definition.declared) === named && canonicalize(definition.declared) === raw
      ? { named, definition, platform: null } : null;
  }
  capture(budget: PreparationBudget = new PreparationBudget()): PreparedRead | null {
    try {
      const snapshot = preparationScope(this.#sql, budget);
      if (snapshot.kind !== "scope") { budget.invalidate(); return null; }
      const policy = this.#policy(budget);
      // One genesis read per operation. Reserving the hard maximum before
      // metadata also prevents recapture from resetting its byte allowance.
      budget.spend({ genesis: B.genesis });
      const reader = new ProofBytes(this.#sql, () => budget.spend({ calls: 1, candidates: 1, metadata: 4096 }));
      const stored = reader.own(0, B.genesis), expected = { at: snapshot.scope.at, seq: 0, hash: snapshot.scope.genesis.hash };
      if (stored.kind !== "body" || !same(stored.value.fact, expected)) return budget.stop();
      const entry = proofEntry(stored.value, expected, B.genesis);
      if (!entry || entry.input.type !== "genesis" || entry.input.decision !== "applied") return budget.stop();
      const named = entry.input.seed.definition;
      if (named.length > 128) return budget.stop();
      budget.spend({ metadata: 2048 }); // full incarnation/genesis/name/policy key
      const id = canonicalize([1, expected, named, policy]);
      if (utf8(id).length > 2048) return budget.stop();
      if (this.#content?.id !== id) this.#content = null;
      let raw: string | null = this.#content?.bytes ?? null;
      if (isDigest(named) && raw === null) {
        budget.spend({ calls: 1, candidates: 1, metadata: 64 });
        const rows = this.#sql.exec("SELECT octet_length(bytes) AS bytes FROM retained_input WHERE kind='definition' AND digest=?", named).toArray();
        const bytes = rows[0]?.["bytes"];
        if (rows.length !== 1 || typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 0) return budget.stop();
        budget.spend({ calls: 1, definition: bytes });
        const bodies = this.#sql.exec("SELECT bytes FROM retained_input WHERE kind='definition' AND digest=? AND octet_length(bytes)=?", named, bytes).toArray();
        if (bodies.length !== 1 || typeof bodies[0]?.["bytes"] !== "string" || utf8(bodies[0]["bytes"]).length !== bytes) return budget.stop();
        raw = bodies[0]["bytes"];
      }
      const pinned = this.#pin(named, raw, budget);
      if (!pinned || !budget.available) return budget.stop();
      if (raw !== null) this.#content = { id, bytes: raw };
      return new PreparedRead(this.#sql, snapshot.scope, entry.input, pinned, budget, () => {
        if (this.#policy(budget) !== policy) return null;
        return this.#pin(named, raw, budget);
      });
    } catch { budget.invalidate(); return null; }
  }
}
