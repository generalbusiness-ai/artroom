/**
 * The pinned digests of the two lane definitions, and the text they were
 * written from. `scripts/pin.mjs` writes this file from the values in
 * `issue.ts` and `change.ts`. A digest is exact for one value: any change
 * of a row, a name or a number is a new definition with a new digest, and a
 * scope that pinned the earlier one keeps it.
 */

import type { Digest } from "@generalbusiness/artroom-contract";

/** Lane forms and browser flow: the revision and the commit whose sections 3, 4 and 8.1 the rows were written from. */
export const LANE_FORMS = { revision: 14, commit: "4b3bf5da" } as const;

/** The definition digest of each lane definition: SHA-256 over the tag `artroom-definition-1`, a newline and its canonical JSON. */
export const DIGESTS = {
  issue: "sha256:325cb4f33da9deb1a31d85ba0f1456068d4d9d08009978b779aed70cb08e00ad",
  change: "sha256:4ff0c7f681c664a3c2dae22bd0df4a9a1bb239e19bc185db41f7f140d4dfca45",
} as const satisfies Record<string, Digest>;
