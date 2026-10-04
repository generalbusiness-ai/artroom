/**
 * The alarm's due times (pins and cleanup), and what the room says and
 * stores when something fails: diagnoses and safe error metadata.
 *
 * One worker loads the Room once for all of these case files. Loading it
 * costs about a second, which is more than most of them take to run. Each
 * case file keeps its own helpers, and every test makes its own room.
 */

import "./pin-delay.cases.ts";
import "./review-f060871b.cases.ts";
import "./request-d268d249.cases.ts";
import "./safe-errors-d29c09fa.cases.ts";
