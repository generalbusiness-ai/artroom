/** TEST ONLY: make the existing foreign branch's authors attribution
 * reachable. This fixture exercises ONLY the foreign branch; it makes no
 * local-hold behavior claim. Canonical bytes, guards and source shape are
 * unchanged. This is no shipped lane revision or canonical repair. */
import type { DeclaredDefinition } from "@generalbusiness/dap-contract";
import { definitionDigest } from "@generalbusiness/artroom-bytes";
import { change } from "../../src/index.ts";

const manifest = change.acts["propose-manifest"];
const original = manifest.effects.find(effect => "attribute" in effect);
if (!original || !("attribute" in original)) throw new Error("canonical manifest authors attribution is missing");
export const experimentalForeignHoldChange = {
  ...change,
  acts: { ...change.acts, "propose-manifest": {
    ...manifest,
    effects: manifest.effects.map(effect => effect === original
      ? { ...effect, attribute: { ...original.attribute, of: "on" as const } }
      : effect),
  } },
} as const satisfies DeclaredDefinition;
export const EXPERIMENTAL_FOREIGN_HOLD_DIGEST = definitionDigest(experimentalForeignHoldChange);
