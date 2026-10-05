import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { definitionDigest } from "@generalbusiness/artroom-bytes";
import { PROFILES, derivable, validateDefinition } from "@generalbusiness/artroom-derive";
import { RULES, definitions, inbox } from "../src/index.ts";

// The plan's T43, for the one definition that exists: `platform:inbox@1` (authority note, revision 16, section 12.1.6).
test("the inbox definition validates whole with the platform option, and is refused without it for its name alone", () => {
  const checked = validateDefinition(inbox, PROPOSED_BOUNDS, PROFILES, { platform: true });
  if (!checked.ok) throw new Error(`the inbox is refused: ${JSON.stringify(checked.problems)}`);

  // Its digest is the bytes package's, in the definition's own domain. No file pins it: a platform definition is pinned by name and version.
  expect(checked.definition.digest).toBe(definitionDigest(inbox));
  // Every form is one that the validator derives: it needs no capability's code. It lists none and declares no rule (section 12.1).
  expect(checked.definition.underived).toEqual([]);
  expect(derivable(checked.definition, null)).toBe(true);
  expect([inbox.capabilities, inbox.rules, inbox.timed]).toEqual([[], {}, {}]);
  // Section 12.1.6: two item types, three acts with the genesis `establish`, and `notify` twice.
  expect([Object.keys(inbox.items), Object.keys(inbox.acts), inbox.genesis, Object.values(inbox.receives).map((h) => [h.message, h.class, h.from.kind])])
    .toEqual([["inbox", "notice"], ["establish", "mark-read", "dismiss"], "establish", [["notify", "advisory", "lane"], ["notify", "advisory", "task"]]]);

  // Without the option it is no declared definition: it has the member `outcomes`, and without that its name is the one problem.
  // The control: the same rows under a name that does not begin `platform:` pass.
  const { outcomes: _, ...rows } = inbox;
  const refused = (value: unknown) => { const checked = validateDefinition(value, PROPOSED_BOUNDS); return checked.ok ? null : checked.problems.map((p) => [p.code, p.path]); };
  expect([refused(inbox), refused(rows), refused({ ...rows, name: "inbox" })]).toEqual([[["shape", "outcomes"]], [["shape", "name"]], null]);

  // The table of rules is empty, and each name in it is a definition that this package holds: a rule cannot be added without its row.
  expect(RULES).toEqual({});
  expect(Object.keys(definitions)).toEqual(["platform:inbox"]);
});
