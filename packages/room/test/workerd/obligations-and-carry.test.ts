/**
 * Obligations and the evidence that meets them: reviews and checks,
 * revocation, carrying to a new generation or integration, and what a check
 * binds.
 *
 * One worker loads the Room once for all of these case files. Loading it
 * costs about a second, which is more than most of them take to run. Each
 * case file keeps its own helpers, and every test makes its own room.
 */

import "./obligations.cases.ts";
import "./review-a711f7b6.cases.ts";
import "./review-95323c2b.cases.ts";
