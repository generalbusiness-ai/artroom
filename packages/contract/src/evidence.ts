/**
 * The evidence of an outcome, by its basis (scope contract, section 4.3,
 * item 4; authority note, section 5.7, "Evidence of each outside effect").
 * Types only.
 *
 * The contract types the basis and leaves the body to the owner of the
 * effect: the authority note names, for each effect, which basis shows that
 * it happened and which shows that it did not, and states no body. So the
 * body stays `unknown` here, and a body is typed by the step that records
 * an effect of its owner. Which result may have which basis is the rule of
 * section 4.3, item 4: `unknown` has the basis `none`, and `confirmed` and
 * `refused` have `own-answer` or `read`.
 */

/** The authenticated answer to that attempt's own request. */
export interface OwnAnswerEvidence { basis: "own-answer"; body: unknown }

/** A read of the outside system that the effect's owner defines as decisive for that effect, such as a ref read back after a compare-and-swap. */
export interface ReadEvidence { basis: "read"; body: unknown }

/** No evidence: the attempt's own answer was lost, or none came. */
export interface NoEvidence { basis: "none"; body: unknown }

/** The evidence of a `confirmed` or a `refused` outcome. */
export type DecisiveEvidence = OwnAnswerEvidence | ReadEvidence;

export type Evidence = DecisiveEvidence | NoEvidence;
