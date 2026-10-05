// What an application does with the installed packages: make a key, write a
// policy, and declare how it would act in a room. It is typechecked, and
// `describe` is run under Node; nothing here contacts a room.
import { canonicalize, connect, generateSigner, isRefusal, type ClientOptions } from "@generalbusiness/artroom-client";
import { isRoomId, type Credentials, type HttpRoom, type PolicyDocument, type RoomId, type Signer } from "@generalbusiness/artroom-contract";
import type { Session } from "@generalbusiness/artroom-contract/client";
import type { PolicyPart } from "@generalbusiness/artroom-contract/policy";
import { validatePolicy } from "@generalbusiness/artroom-policy";
import { defaultPolicy, owners, policy } from "@generalbusiness/artroom-policy/helpers";
import { ownerReview } from "@generalbusiness/artroom-policy/pack";

const parts: readonly PolicyPart[] = [owners({ "src/**": "@alice" }), ownerReview()];
export const document: PolicyDocument = policy(...parts);

/** Typechecked only: an application's first act in a room. */
export async function claimIn(url: `https://${string}`, room: RoomId, signer: Signer, options?: ClientOptions): Promise<string> {
  const credentials: Credentials = { kind: "key", signer };
  const joined: HttpRoom = await connect({ url }, room, credentials, options);
  const claim = await joined.claim({ goal: "Add a bass line", scope: ["parts/bass/**"] });
  return isRefusal(claim) ? `${claim.rule}: ${claim.reason}` : "claimed";
}

export type SessionExpiry = Session["expiresAt"];

export async function describe(): Promise<string> {
  const { signer } = await generateSigner();
  const key: string = signer.key;
  return canonicalize({
    key: key.slice(0, 8),
    roomId: isRoomId("not-a-room"),
    rules: document.rules.length,
    defaultRules: defaultPolicy().rules.length,
    valid: validatePolicy(document).ok,
  });
}
