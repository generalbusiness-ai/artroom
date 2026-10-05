import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type DeclaredDefinition } from "@generalbusiness/artroom-contract";
import { definitionDigest } from "@generalbusiness/artroom-bytes";
import { PROFILES, derivable, validateDefinition } from "@generalbusiness/artroom-derive";
import { RULES, definitions, inbox } from "../src/index.ts";

// The plan's T43, for the one definition that exists: `platform:inbox@1` (authority note, revision 16, section 12.1.6).
test("the inbox definition validates whole with the platform option, with its marks listed, and is refused without it", () => {
  const checked = validateDefinition(inbox, PROPOSED_BOUNDS, PROFILES, { platform: true });
  if (!checked.ok) throw new Error(`the inbox is refused: ${JSON.stringify(checked.problems)}`);

  // Its digest is the bytes package's, in the definition's own domain. No file pins it: a platform definition is pinned by name and version.
  expect(checked.definition.digest).toBe(definitionDigest(inbox as unknown as DeclaredDefinition));
  // Every form is one that the validator derives: it needs no capability's code. It lists none and declares no rule (section 12.1).
  expect(checked.definition.underived).toEqual([]);
  expect(derivable(checked.definition, null)).toBe(true);
  expect([inbox.capabilities, inbox.rules, inbox.timed]).toEqual([[], {}, {}]);
  // Section 12.1.6: two item types, three acts with the genesis `establish`, and `notify` twice.
  expect([Object.keys(inbox.items), Object.keys(inbox.acts), inbox.genesis, Object.values(inbox.receives).map((h) => [h.message, h.class, h.from.kind])])
    .toEqual([["inbox", "notice"], ["establish", "mark-read", "dismiss"], "establish", [["notify", "advisory", "lane"], ["notify", "advisory", "task"]]]);

  // Without the option it is no declared definition: it has the member `outcomes`; without that, its name is the one problem that
  // is found before the rows are read; and under a declared name each mark is a form that the contract does not define.
  const { outcomes: _, ...rows } = inbox;
  const refused = (value: unknown) => { const checked = validateDefinition(value, PROPOSED_BOUNDS); return checked.ok ? null : checked.problems.map((p) => [p.code, p.path]); };
  const marks = [["shape", "receives.notify-from-lane.effects.4"], ["shape", "receives.notify-from-task.effects.4"]];
  expect([refused(inbox), refused(rows), refused({ ...rows, name: "inbox" })]).toEqual([[["shape", "outcomes"]], [["shape", "name"]], marks]);

  // The data says where each rule stands: the mark `notice-source`, row P22, is the last effect of each `notify` handler. No table
  // beside the data says so. The table of rules is empty, so no runtime can run the inbox yet.
  expect(checked.definition.marks.map((m) => [m.place, m.path, m.code, m.row])).toEqual([
    [5, "receives.notify-from-lane.effects.4", "notice-source", "P22"], [5, "receives.notify-from-task.effects.4", "notice-source", "P22"],
  ]);
  expect(RULES).toEqual({});
  expect(Object.keys(definitions)).toEqual(["platform:inbox"]);
});
