/** Explicit demo creation version. Existing registers and defaults keep their pins. */
import type { PlatformData } from "@generalbusiness/dap-contract";
import { intentDigest } from "@generalbusiness/artroom-bytes";
import type { Rules } from "@generalbusiness/dap-derive";
import { register, registerRules } from "./register.ts";
export const DEMO_REGISTER = "platform:register@7" as const;
/** Explicit future web creation cohort; the original demo register keeps its pin. */
export const WEB_DEMO_REGISTER = "platform:register@8" as const;
export const WEB_DEMO_COHORT = {
  register: WEB_DEMO_REGISTER, directory: "platform:directory@7", membership: "platform:membership@2",
  rules: "platform:rules@4", destination: "platform:destination@3",
} as const;
export const DEMO_PURPOSE = "demo-start" as const;
const purpose = { type: "enum", of: [DEMO_PURPOSE] } as const;
const item = register.items["register"]!, install = register.acts["install"]!;
/** The native name stays platform:register; this version records its demo purpose. */
export const demoRegister: PlatformData = {
  ...register,
  items: { ...register.items, register: { ...item, values: { ...item.values, purpose: { fixed: true, required: true, of: purpose } } } },
  acts: { ...register.acts, install: { ...install, fields: { ...install.fields, purpose: { ...purpose, required: true } }, effects: [...install.effects, { value: { slot: "purpose", from: { field: "purpose" } } }] } },
};
export const demoRegisterRules: Rules = {
  ...registerRules,
  install: {
    place: "grant", refusals: [],
    run: ({ input }) => {
      if (input.type !== "genesis" || !input["founding"]) return { pass: false };
      const intent = input["founding"].intent;
      return intentDigest(intent) === input.seed.cause && intent.fields["purpose"] === DEMO_PURPOSE && intent.fields["policy"] === "open" && !Object.hasOwn(intent.fields, "founders") ? { pass: true, member: null } : { pass: false };
    },
  },
};

/** Version 8 keeps the same demo admission data; its named directory mapping differs. */
export const webDemoRegister: PlatformData = { ...demoRegister };
