/**
 * Capabilities: platform code with a name and a version (scope contract,
 * section 6.11). A capability version declares four kinds of form: records,
 * guards, effects and steps. A definition lists the versions it uses and
 * reaches a record only through the declared guards and effects.
 *
 * `CAPABILITIES` restates the contract's tables for `hold@1` and
 * `git-read@1` as data, as far as the tables give names, and adds the records
 * and steps that the authority note's section 5.7 lists. It is what a
 * validator checks a `capability` guard or effect, a `carried` part and the
 * kind of a preparation entry against. It holds no rule: the rules behind
 * each record, guard, effect and step are the authority note's. The derive
 * package derives them, in `src/capability/` and `src/prepare.ts`, as far
 * as I3 steps 16 and 16a to 16c built them, and the production ports of
 * the scope package hold that code. A runtime that has no code for them
 * answers `unsupported-definition` for a definition that needs one.
 */

export type CapabilityName = `${"hold" | "git-read"}@${number}`;

/** A kind of local state that is not an item. Its key and its values are the capability's to define. */
export interface CapabilityRecord {
  states: readonly string[];
  final: readonly string[];              // the states in which a record is retained and changes no more
}

/**
 * A named condition over the capability's records, the arguments and local
 * state. When it fails, the refusal is `capability-refused` with one of
 * `refusals` as its name.
 */
export interface CapabilityGuard {
  with: readonly string[];               // the arguments the contract's table names
  refusals: readonly string[];
}

/** A named change to the capability's records. Each list of `with` is one set of arguments the effect may be written with. */
export interface CapabilityEffect {
  with: readonly (readonly string[])[];
}

/** Preparation the capability performs before an act (section 5.5). A step is asked for with a signed intent, and no definition writes one. */
export interface CapabilityStep {
  foreign: boolean;                      // the intent may be addressed to another scope than the one that prepares
}

/**
 * A record that, while it is in the state `while`, reserves one entry for
 * each of a bounded number of numbered requests (sections 6.11 and 17.2).
 */
export interface ReservedRequests {
  record: string;
  while: string;
  request: { class: "tell"; message: string; number: string };   // the message, and the field that carries its number
  bound: number;                         // the highest number a request may carry
  count: string;                         // the value of the record that holds the highest number decided
}

export interface Capability {
  records: Record<string, CapabilityRecord>;
  guards: Record<string, CapabilityGuard>;
  effects: Record<string, CapabilityEffect>;
  steps: Record<string, CapabilityStep>;
  reserved: readonly ReservedRequests[];
}

/** What `hold@1` and `git-read@1` declare (section 6.11). The item form of `hold@1`, with its `hold` effect, is section 6.8. */
export const CAPABILITIES = {
  "hold@1": {
    records: {
      root: { states: ["creating", "live", "retiring", "retired"], final: ["retired"] },
      pin: { states: ["provisional", "held", "released"], final: ["released"] },
      check: { states: ["recorded", "too-large"], final: ["recorded", "too-large"] },
      "receiver-pin": { states: ["standing", "released"], final: ["released"] },
      // The authority note's, section 5.7: the three records beyond the item form. The contract leaves them to it (section 6.11).
      fork: { states: ["creating", "selected", "deleting", "deleted", "failed"], final: ["deleted", "failed"] },
      token: { states: ["minting", "live", "revoking", "ended"], final: ["ended"] },
      instance: { states: ["current", "past"], final: ["past"] },
    },
    guards: {
      staged: { with: ["commit", "under", "pin"], refusals: ["not-staged"] },
      pin: { with: ["consumer", "intent", "commit"], refusals: ["no-pin", "pin-mismatch", "never-admitted"] },
      license: { with: ["export", "from", "checkpoint", "hold", "instance"], refusals: ["export-not-authorized", "target-not-held", "target-fixed"] },
      settled: { with: ["export", "from", "final", "by"], refusals: ["export-not-authorized", "not-final"] },
    },
    effects: {
      "pin-hold": { with: [["commit"], ["consumer", "intent", "manifest"]] },
      "pin-release": { with: [["commit"], ["consumer", "intent", "manifest", "by"]] },
      license: { with: [["export", "from", "checkpoint", "hold", "instance", "k"]] },
      settle: { with: [["export", "by"]] },
    },
    // `instance`, `token`, `retire` and `retry` are the authority note's, section 5.7. Each is asked of the lane that owns the hold or the ledger.
    steps: { stage: { foreign: true }, check: { foreign: true }, instance: { foreign: false }, token: { foreign: false }, retire: { foreign: false }, retry: { foreign: false } },
    reserved: [{ record: "receiver-pin", while: "standing", request: { class: "tell", message: "export-license", number: "k" }, bound: 3, count: "decided" }],
  },
  "git-read@1": {
    // The authority note's, sections 3.11 and 5.7: a job's read token is a record "of the same form" as the `token` of `hold@1`, in
    // the change lane, and belongs to this capability. The snapshot repository of a filtered check has no record here: the note
    // names none and gives it no states (I3 deltas, entries E4 and EW3).
    records: { token: { states: ["minting", "live", "revoking", "ended"], final: ["ended"] } },
    guards: {
      ancestry: { with: ["commit", "row", "pin", "selected", "earlier"], refusals: ["ancestry-too-large", "ancestry-stale", "unnamed-work"] },
    },
    effects: {},
    // `job-read` is the authority note's, sections 3.11 and 5.7: the checker's request to the change lane that owns the job.
    steps: { "job-read": { foreign: false } },
    reserved: [],
  },
} as const satisfies Record<CapabilityName, Capability>;
