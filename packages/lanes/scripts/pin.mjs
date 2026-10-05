#!/usr/bin/env node
// Pin the two lane definitions: write the canonical bytes of each to
// definitions/, and their digests to src/digests.ts, from the values in src/.
//
//   node packages/lanes/scripts/pin.mjs
//
// A person runs it when a row of a definition changes. A changed row is a new
// definition with a new digest: scopes that pinned the earlier digest keep it.
// test/definitions.test.ts fails while the files are not the ones this writes.
//
// The digest is `definitionDigest` of the bytes package: SHA-256 over the tag
// `artroom-definition-1`, a newline and the canonical JSON of the whole value.
// Node reads the TypeScript sources directly, by removing their types.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalize, definitionDigest } from "@generalbusiness/artroom-bytes";
import { change } from "../src/change.ts";
import { LANE_FORMS } from "../src/digests.ts";
import { issue } from "../src/issue.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pinned = Object.entries({ issue, change }).map(([name, definition]) => {
  const bytes = canonicalize(definition);
  writeFileSync(join(root, "definitions", `${name}.json`), bytes);
  return { name, digest: definitionDigest(definition), size: Buffer.byteLength(bytes) };
});

const digest = (name) => pinned.find((p) => p.name === name).digest;
writeFileSync(join(root, "src", "digests.ts"), `/**
 * The pinned digests of the two lane definitions, and the text they were
 * written from. \`scripts/pin.mjs\` writes this file from the values in
 * \`issue.ts\` and \`change.ts\`. A digest is exact for one value: any change
 * of a row, a name or a number is a new definition with a new digest, and a
 * scope that pinned the earlier one keeps it.
 */

import type { Digest } from "@generalbusiness/artroom-contract";

/** Lane forms and browser flow: the revision and the commit whose sections 3, 4 and 8.1 the rows were written from. */
export const LANE_FORMS = { revision: ${LANE_FORMS.revision}, commit: "${LANE_FORMS.commit}" } as const;

/** The definition digest of each lane definition: SHA-256 over the tag \`artroom-definition-1\`, a newline and its canonical JSON. */
export const DIGESTS = {
  issue: "${digest("issue")}",
  change: "${digest("change")}",
} as const satisfies Record<string, Digest>;
`);
for (const p of pinned) console.log(`${p.name}  ${p.digest}  ${p.size} canonical bytes`);
