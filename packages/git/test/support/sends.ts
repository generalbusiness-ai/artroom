/**
 * The table of sends (I3 plan, row T9): what is known after one
 * compare-and-set, case by case. The expected values are the authority
 * note's text, not any implementation's: section 6.6, step 4, for the class
 * of the send; section 5.7, the row "Updating the branch", and section 6.6,
 * "What `published` settles and what it does not", for the attempt's
 * outcome; step 6 for what the read shows.
 *
 * `packages/git/test/push.test.ts` runs it against a real local repository
 * behind the real gateway.
 */
// I3 merge: the plan's T9 also runs this table against `MemoryHost`, the host stand-in of the platform package's test support
// (step 9). That stand-in is not in this worktree. Its test imports this table and states the same five rows.

export interface SendRow {
  name: string;
  /** What happens to the one send. `stale`: the ref left the base before the client read it. */
  fault: "none" | "lost-after" | "lost-before" | "moved" | "stale";
  /** The class of the send (section 6.6, step 4). */
  send: "not-sent" | "refused" | "unknown";
  /** The attempt's outcome in the ledger, and the basis of its evidence. */
  result: "confirmed" | "refused" | "unknown";
  basis: "read" | "own-answer" | "none";
  /** What the read of the ref shows afterwards. */
  shows: "commit" | "base" | "other";
  /**
   * How many updates left the gateway for the host: the count of forwards
   * in the grant's record. It is not a count of what the host received. In
   * the row `lost-before` the one request left the gateway and was lost on
   * its way, so the count is 1 and the host holds the base. For the rows
   * that the real repository runs, the host stand-in counted the same
   * number of arrivals.
   */
  reached: 0 | 1;
}

export const SENDS: readonly SendRow[] = [
  { name: "the update is applied and its answer arrives", fault: "none", send: "unknown", result: "confirmed", basis: "read", shows: "commit", reached: 1 },
  { name: "the update is applied and its reply is lost", fault: "lost-after", send: "unknown", result: "unknown", basis: "none", shows: "commit", reached: 1 },
  { name: "the request is lost before it arrives", fault: "lost-before", send: "unknown", result: "unknown", basis: "none", shows: "base", reached: 1 },
  { name: "another writer moves the ref before the update arrives, and the host refuses it", fault: "moved", send: "refused", result: "refused", basis: "own-answer", shows: "other", reached: 1 },
  { name: "the ref has left the base when the client reads it, and nothing is sent", fault: "stale", send: "not-sent", result: "refused", basis: "own-answer", shows: "other", reached: 0 },
];
