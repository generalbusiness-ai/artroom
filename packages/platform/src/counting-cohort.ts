/** Explicit bounded room for Counting; no default or domain grant changes. */
import type { PlatformData } from "@generalbusiness/artroom-contract";
import { directory5, directoryRules5 } from "./application.ts";

export const COUNTING_COHORT = {
  register: "platform:register@6", directory: "platform:directory@6", membership: "platform:membership@5",
  rules: "platform:rules@3", destination: "platform:destination@2", inbox: "platform:inbox@1",
} as const;

const establish = directory5.acts["establish"]!;
export const directory6: PlatformData = {
  ...directory5,
  acts: {
    ...directory5.acts,
    establish: {
      ...establish,
      sends: establish.sends.map((send) => "create" in send && send.create.kind === "membership"
        ? { create: { ...send.create, definition: COUNTING_COHORT.membership } } : send),
    },
  },
};
export const directoryRules6 = directoryRules5;
