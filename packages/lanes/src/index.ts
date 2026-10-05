/**
 * The two lane definitions, `issue` and `change`, as data. A lane is a
 * definition: this package holds no rule and no code that judges.
 *
 * `DIGESTS` holds the pinned digest of each, and `definitions/issue.json`
 * and `definitions/change.json` its canonical bytes: what a creator retains
 * for its children, and what a rules scope will activate by digest. The
 * package exports both files. `scripts/pin.mjs` writes them from the values.
 */

import type { DeclaredDefinition } from "@generalbusiness/artroom-contract";
import { change } from "./change.ts";
import { issue } from "./issue.ts";

export { issue, change };
export { DIGESTS, LANE_FORMS } from "./digests.ts";
export type { LaneDefinition } from "./shared.ts";

/** Both declarations, as a founder supplies them in `definitions`, so that a directory which names their digests in a `create` retains their bytes. */
export const definitions: readonly DeclaredDefinition[] = [issue, change];
