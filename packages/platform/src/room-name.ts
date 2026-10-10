/** New explicit naming cohort. Shipped room identities and defaults are unchanged. */
import type { PlatformData } from "@generalbusiness/artroom-contract";
import type { Rules } from "@generalbusiness/artroom-derive";
import { directory5, directoryRules5 } from "./application.ts";

export const ROOM_NAME_COHORT = {
  register: "platform:register@7", directory: "platform:directory@7", membership: "platform:membership@6",
  rules: "platform:rules@3", destination: "platform:destination@3", inbox: "platform:inbox@1",
} as const;
export const ROOM_NAME_BYTES = 256;
const NAME = { type: "code", code: "room-name", row: "N1" } as const;

/** Reject before any name-specific UTF-8 encoding; never trim, normalize or truncate. */
export function isRoomName(value: unknown): value is string {
  if (typeof value !== "string" || value.length > ROOM_NAME_BYTES) return false;
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029 || (code >= 0xd800 && code <= 0xdfff)) return false;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes > ROOM_NAME_BYTES) return false;
  }
  return value === value.trim();
}

const establish = directory5.acts["establish"]!;
export const directory7: PlatformData = {
  ...directory5,
  items: { ...directory5.items, "room-profile": {
    many: false, max: 1, initial: "open", states: { open: { final: false } },
    parties: {}, refs: {},
    values: { displayName: { fixed: false, required: true, of: NAME } },
  } },
  acts: {
    ...directory5.acts,
    establish: { ...establish, sends: establish.sends.map((send) =>
      "create" in send && send.create.kind === "membership"
        ? { create: { ...send.create, definition: ROOM_NAME_COHORT.membership } } : send) },
    "name-room": {
      step: "open", on: "room-profile", grant: "room.name", also: {},
      fields: { name: { ...NAME, required: true } },
      guards: [{ none: { type: "room-profile", states: ["open"] }, reason: "profile-exists" }],
      effects: [{ value: { slot: "displayName", from: { field: "name" } } }],
      sends: [], attention: [],
    },
    "set-room-name": {
      step: "transition", on: "room-profile", grant: "room.name", also: {},
      fields: { name: { ...NAME, required: true } },
      guards: [{ state: ["open"] }],
      effects: [{ value: { slot: "displayName", from: { field: "name" } } }],
      sends: [], attention: [],
    },
  },
};
export const directoryRules7: Rules = {
  ...directoryRules5,
  "room-name": { place: "type", run: (_given, value) => isRoomName(value) },
};
