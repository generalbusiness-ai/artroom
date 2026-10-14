import { keyIdOfSecret, textDigest } from "@generalbusiness/artroom-bytes";
import { DIGESTS, change, issue } from "../../src/index.ts";
import { rita, soon, una, vic } from "./graph.ts";
import { room as nativeRoom, checkerKey } from "./room.ts";

/** Native test configuration: two controlled agents and independent people, not fixture grants. */
export async function delegatedRoom() {
  const r = await nativeRoom({ roster: ["@paul"] });
  const memberActions = (await r.M.item(0)).values["memberActions"];
  if (!Array.isArray(memberActions) || !memberActions.every(action => typeof action === "string")) throw new Error("Native member actions unavailable");
  // Explicit test policy lets Paul check and lets the independent reviewer's
  // wrong-checker attempt reach the lane guard, before either key is observed.
  await r.M.did(rita, "set-actions", { on: 0, expected: await r.M.expected({ on: 0 }), fields: { role: "member", actions: [...new Set([...memberActions, "change.check"])] } });
  const quinnSecret = new Uint8Array(32).fill(7);
  const quinn = { secret: quinnSecret, key: keyIdOfSecret(quinnSecret), member: await r.member("@quinn"), principal: null };
  const reviewer = { ...checkerKey, member: await r.member("@check"), principal: null };
  for (const [who, handle] of [[quinn, "@quinn"], [reviewer, "@check"]] as const) {
    const secret = `Native witness invitation for ${handle}, at least thirty-two bytes`;
    const invitation = await r.M.did(rita, "invite-member", { fields: { handle, role: "member", inviteHash: textDigest(secret), inviteEnds: soon(3600) } });
    r.members[handle] = invitation;
    await r.M.did(who, "join", { fields: { invitation, secret } });
  }
  const actions = (await r.M.item(0)).values["agentActions"];
  if (!Array.isArray(actions) || !actions.every(action => typeof action === "string")) throw new Error("Native agent actions unavailable");
  // Explicit native test policy permits review, so author guards—not absent grants—decide the negative witnesses.
  await r.M.did(rita, "set-actions", { on: 0, expected: await r.M.expected({ on: 0 }), fields: { role: "agent", actions: [...new Set([...actions, "change.review"])] } });
  for (const [who, handle, controller] of [[una, "@una", "@paul"], [vic, "@vic", "@quinn"]] as const) {
    const member = await r.M.did(rita, "add-member", { fields: { handle, kind: "agent", controller: await r.member(controller) } });
    r.members[handle] = member;
    const secret = `Native witness key invitation for ${handle}, at least thirty-two bytes`;
    const invitation = await r.M.did(rita, "invite-key", { fields: { member, kind: "agent", inviteHash: textDigest(secret), inviteEnds: soon(3600) }, expected: await r.M.expected({ member }) });
    await r.M.did(who, "enrol", { on: 0, fields: { invitation, secret }, expected: await r.M.expected({ on: 0, member }) });
  }
  await r.activate(issue, DIGESTS.issue);
  await r.activate(change, DIGESTS.change);
  await r.settle();
  return { r, reviewer };
}
