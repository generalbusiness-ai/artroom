/** Explicit new cohort. Existing pins retain secret-bearing invitation semantics. */
import { INVITATION_KEY_MEMBERSHIP } from "@generalbusiness/dap-contract";
import type { PlatformData } from "@generalbusiness/dap-contract";
import { isKeyId, verifyInvitationProof } from "@generalbusiness/artroom-bytes";
import type { Rules } from "@generalbusiness/dap-derive";
import { APPLICATION_COHORT, directory5, directoryRules5 } from "./application.ts";
import { membership, membershipRules } from "./membership.ts";

export const INVITATION_KEY_COHORT = {
  ...APPLICATION_COHORT,
  register: "platform:register@10", directory: "platform:directory@9", membership: INVITATION_KEY_MEMBERSHIP,
} as const;

const invitationFields = (kind: "invite-member" | "invite-key"): PlatformData["acts"][string] => {
  const original = membership.acts[kind]!;
  const { inviteHash: _old, ...fields } = original.fields;
  return {
    ...original,
    fields: { ...fields, inviteKey: { type: "text", max: 64, required: true } },
    guards: [...original.guards, { code: "invitation-key-form", row: "IK1" }],
    effects: original.effects.map(effect => "value" in effect && effect.value.slot === "inviteHash"
      ? { value: { slot: "inviteKey", from: { field: "inviteKey" } } } : effect),
  };
};
const invitationItem = (kind: "member" | "key"): PlatformData["items"][string] => {
  const original = membership.items[kind]!;
  const { inviteHash: _old, ...values } = original.values;
  return { ...original, values: { ...values, inviteKey: { fixed: true, required: false, of: { type: "text", max: 64 } } } };
};
const redeem = (kind: "join" | "enrol"): PlatformData["acts"][string] => ({
  ...membership.acts[kind]!,
  fields: { invitation: { type: "int", min: 1, max: 1_000_000_000, required: true }, proof: { type: "text", max: 86, required: true } },
});
export const membership6: PlatformData = {
  ...membership,
  items: { ...membership.items, member: invitationItem("member"), key: invitationItem("key") },
  acts: { ...membership.acts, "invite-member": invitationFields("invite-member"), "invite-key": invitationFields("invite-key"), join: redeem("join"), enrol: redeem("enrol") },
};

export const membershipRules6: Rules = {
  ...membershipRules,
  "invitation-key-form": {
    place: "guard", refusals: ["bad-invitation-key"],
    run: given => isKeyId(given.resolved.fields["inviteKey"]) ? { holds: true } : { holds: false, code: "bad-field", name: "bad-invitation-key" },
  },
  invitation: {
    place: "also",
    run: (given, type) => {
      if (given.input.type !== "act") return null;
      const { invitation, proof } = given.resolved.fields;
      const item = typeof invitation === "number" ? given.state.item(invitation) : null;
      const scope = given.state.scope();
      return item?.type === type && scope && verifyInvitationProof(item.values["inviteKey"], proof, scope.at, invitation as number, given.input.signed.intent.actor) ? item.id : null;
    },
  },
};

const establish = directory5.acts["establish"]!;
export const directory9: PlatformData = {
  ...directory5,
  acts: { ...directory5.acts, establish: { ...establish, sends: establish.sends.map(send =>
    "create" in send && send.create.kind === "membership" ? { create: { ...send.create, definition: INVITATION_KEY_COHORT.membership } } : send) } },
};
export const directoryRules9 = directoryRules5;
