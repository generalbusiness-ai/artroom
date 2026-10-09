/** Exact Pages preparation proposal. Applying it requires reviewed descriptor and native admin authority. */
import { canonicalize, definitionDigest, digestBytes, utf8 } from "@generalbusiness/artroom-bytes";
import { issue, change, DIGESTS } from "@generalbusiness/artroom-lanes";
import { firstExtents } from "@generalbusiness/artroom-platform";

function frozen<T>(value: T): T { if (value && typeof value === "object") { for (const member of Object.values(value)) frozen(member); Object.freeze(value); } return value; }
const definitions = [issue, change].map((definition) => {
  const bytes = canonicalize(definition);
  const digest = definitionDigest(definition);
  if (digest !== DIGESTS[definition.name]) throw new Error("The exported full lane definition does not match its pin.");
  return { name: definition.name, digest, bytes, size: utf8(bytes).length };
});
/** Native complete publish fields. Empty checks means no provisioned machine checker, never a passed check. */
export const PAGES_RULES = frozen({ approvals: 1, ownerMayReview: false, singleControllerException: false, checks: [], labels: [], extents: firstExtents({ approvals: 1, checks: [] }) });
/** Self-created issue children name `self`; no external lane-definition dependency is inferred. Platform cohort stays explicitly @2. */
export const PAGES_PRESET = frozen({
  format: "artroom-pages-preset-1", version: 1, runtime: { packages: "0.1.0-dev.1", source: "f6d80b3996df7ad3e7d00feff88d48cf29877ddc", cohort: { register: "platform:register@2", directory: "platform:directory@2", membership: "platform:membership@2", rules: "platform:rules@2", destination: "platform:destination@2" } },
  definitions, closure: definitions.map(({ name, digest }) => ({ name, digest })), rules: PAGES_RULES,
  meaning: "One distinct human approval; source reviewer holds change.review; authority extent reviewer holds rules.publish; no owner or single-controller exception; no machine check claimed. Definitions alone do not establish readiness.",
});
export const PAGES_PRESET_BYTES = canonicalize(PAGES_PRESET);
export const PAGES_PRESET_DIGEST = digestBytes(utf8(PAGES_PRESET_BYTES));
