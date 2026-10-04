/**
 * Who may act: the roster, delegation, the recovery key, redemption and its
 * rate limit, authority judged at the final boundary, and obligations after
 * a policy activation.
 *
 * One worker loads the Room once for all of these case files. Loading it
 * costs about a second, which is more than most of them take to run. Each
 * case file keeps its own helpers, and every test makes its own room.
 */

import "./roster.cases.ts";
import "./request-c657d4ba.cases.ts";
import "./review-aabda1ed.cases.ts";
