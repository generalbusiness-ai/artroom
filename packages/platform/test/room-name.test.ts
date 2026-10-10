import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { runnable, validateDefinition } from "@generalbusiness/artroom-derive";
import { RULE_PROFILES } from "@generalbusiness/artroom-derive/rule";
import { APPLICATION_COHORT, COUNTING_COHORT, DIRECTORY_OF, FIRST_ACTIONS_OF, NEWEST, ROOM_NAME_COHORT, SIBLINGS_OF, directory7, isRoomName, membership, platform } from "../src/index.ts";

// Actual data and pure native code, not a native transaction, grant or concurrent admission.
test("explicit naming preserves F1 application and destination3 forms, old cohorts and defaults, with one bounded scalar text mark and admin-only initial naming actions", () => {
  expect(ROOM_NAME_COHORT).toEqual({ register: "platform:register@7", directory: "platform:directory@7", membership: "platform:membership@6", rules: "platform:rules@3", destination: "platform:destination@3", inbox: "platform:inbox@1" });
  expect(DIRECTORY_OF[ROOM_NAME_COHORT.register]).toBe(ROOM_NAME_COHORT.directory);
  expect(SIBLINGS_OF[ROOM_NAME_COHORT.directory]).toEqual({ membership: ROOM_NAME_COHORT.membership, rules: ROOM_NAME_COHORT.rules, destination: ROOM_NAME_COHORT.destination });
  expect(NEWEST).toEqual({ "platform:register": "platform:register@3", "platform:directory": "platform:directory@3", "platform:membership": "platform:membership@2", "platform:rules": "platform:rules@2", "platform:destination": "platform:destination@3", "platform:inbox": "platform:inbox@1" });
  const application = platform(APPLICATION_COHORT.directory)!;
  expect(directory7.acts["establish-application"]).toBe(application.data.acts["establish-application"]);
  expect(platform(ROOM_NAME_COHORT.directory)!.rules["create-application"]).toBe(application.rules["create-application"]);
  expect(platform(ROOM_NAME_COHORT.membership)!.data).toBe(membership);
  expect([membership.items["member"]!.max, membership.items["key"]!.max]).toEqual([10000, 10000]);
  expect([platform(COUNTING_COHORT.membership)!.data.items["member"]!.max, platform(COUNTING_COHORT.membership)!.data.items["key"]!.max]).toEqual([16, 32]);
  for (const pin of ["platform:directory@1", "platform:directory@2", "platform:directory@3", APPLICATION_COHORT.directory, COUNTING_COHORT.directory]) {
    expect([Object.hasOwn(platform(pin)!.data.items, "room-profile"), Object.hasOwn(platform(pin)!.data.acts, "name-room")]).toEqual([false, false]);
  }
  const original = FIRST_ACTIONS_OF[APPLICATION_COHORT.membership]!;
  for (const [role, actions] of Object.entries(FIRST_ACTIONS_OF[ROOM_NAME_COHORT.membership]!)) {
    expect(actions).toEqual([...original[role as keyof typeof original], ...(role === "admin" ? ["room.name", "site.name-publication"] : [])]);
  }
  expect(directory7.items["room-profile"]).toMatchObject({ many: false, max: 1, initial: "open", states: { open: { final: false } }, parties: {}, refs: {} });
  const type = directory7.items["room-profile"]!.values["displayName"]!.of;
  const { required, ...inputType } = directory7.acts["name-room"]!.fields["name"]!;
  expect([required, inputType, directory7.acts["set-room-name"]!.fields["name"]]).toEqual([true, type, { ...type, required: true }]);
  // This one boundary distinguishes UTF-8 byte size from UTF-16 length. Empty clears; no normalization occurs.
  const bound = "é".repeat(128);
  expect([isRoomName(""), isRoomName(bound), isRoomName(bound + "é"), isRoomName("a".repeat(257)), isRoomName("x\ud800"), isRoomName("x\n"), isRoomName(" x")]).toEqual([true, true, false, false, false, false, false]);
  const decomposed = "Cafe\u0301";
  expect(isRoomName(decomposed)).toBe(true);
  for (const pin of new Set(Object.values(ROOM_NAME_COHORT))) {
    const supplied = platform(pin)!;
    const checked = validateDefinition(supplied.data, PROPOSED_BOUNDS, RULE_PROFILES, { platform: true });
    expect(checked.ok ? [] : checked.problems, pin).toEqual([]);
    if (checked.ok) expect(runnable(checked.definition, supplied.rules), pin).toBe(true);
  }
});
