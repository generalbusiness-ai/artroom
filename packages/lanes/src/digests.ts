/**
 * The pinned digests of the two lane definitions and of the demo profile,
 * and the text they were written from. `scripts/pin.mjs` writes this file
 * from the values in `issue.ts`, `change.ts` and `demo.ts`. A digest is exact for one value: any change
 * of a row, a name or a number is a new definition with a new digest, and a
 * scope that pinned the earlier one keeps it.
 */

import type { Digest } from "@generalbusiness/artroom-contract";

/** Lane forms and browser flow: the revision and the commit whose sections 3, 4 and 8.1 the rows were written from. */
export const LANE_FORMS = { revision: 14, commit: "4b3bf5da" } as const;

/** The definition digest of each lane definition: SHA-256 over the tag `artroom-definition-1`, a newline and its canonical JSON. */
export const DIGESTS = {
  issue: "sha256:325cb4f33da9deb1a31d85ba0f1456068d4d9d08009978b779aed70cb08e00ad",
  change: "sha256:e182f6fb8ebc0525214e6fd9139c6c5e405d9bab2885d7202cd66602f8155a07",
} as const satisfies Record<string, Digest>;

/** The definition digest of each definition of the demo profile (`demo.ts`): `definitions/issue-demo.json` and `definitions/change-demo.json`. */
export const DEMO_DIGESTS = {
  issue: "sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e",
  change: "sha256:8d777c02d4fbd06b9f719c00ff48e59e7f284a44191b1b4a24b9c32c142e27d6",
} as const satisfies Record<string, Digest>;
