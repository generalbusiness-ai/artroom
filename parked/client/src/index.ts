/**
 * @generalbusiness/artroom-client
 *
 * The contract's `RoomApi` over HTTPS (`HttpRoom`) and over a service
 * binding (`Room`), with Ed25519 envelope signing, idempotent retries,
 * invitation redemption and resumable cursors. WebCrypto only: it runs in
 * Workers, Node 22+ and current browsers.
 *
 *   const room = await connect({ url }, roomId, { kind: "key", signer });
 *   const claim = await room.claim({ goal, scope });
 *   if (isRefusal(claim)) show(claim.rule, claim.reason, claim.fix);
 *
 * Any declared act, with the binding read from the room (R-DECL-16):
 *
 *   const catalogue = await room.acts();
 *   const { binding } = catalogue.acts["take-part"];
 *   const out = await room.act("take-part", null, { part: "bass" }, { binding });
 */

export { connect, join, redeem, resubmit, roomIdOf, LOST_REDEMPTION } from "./connect.ts";
export { HttpRoomClient, RpcRoomClient, WS_PROTOCOL, WS_TOKEN_PREFIX, type Watch, type PreparedAct, type ClientActOptions, type ClientGenericActOptions } from "./room.ts";
export type { ClientOptions } from "./wire.ts";
export { canonicalize, canonicalBytes, digestOf } from "./canonical.ts";
export { buildDeclaredEnvelope, buildEnvelope, checkBinding, signEnvelope, signRequest, type Identity } from "./envelope.ts";
export { delegateOp, invitationSession, type GrantKinds } from "./grants.ts";
// Reading a room's declarations (declared acts stage 5): the meaning of a record at its own seq, the fields of an
// act, the binding a named method was built for, and a grant expanded into the map its grantor signs.
export {
  builtForBinding,
  expandGrant,
  fieldsOf,
  governs,
  isPlatformKind,
  meaningOf,
  shapeOf,
  targetsOf,
  threadTitle,
  titleOf,
  type ActField,
  type ExpandedGrant,
  type GrantExpansion,
} from "@generalbusiness/artroom-policy/declared";
export {
  fromBase64Url,
  generateSigner,
  keyIdOf,
  newIdempotencyKey,
  publicKeyOf,
  randomToken,
  signerFromJwk,
  signingBytes,
  signValue,
  toBase64Url,
  verifyValue,
  type PrivateJwk,
} from "./keys.ts";
export { artroomError, Redactor, STATUS } from "./errors.ts";
export { agentsMd, AGENTS_MD_BEGIN, AGENTS_MD_END, type AgentsMdOptions } from "./agents-md.ts";
export { isArtroomError, isRefusal } from "@generalbusiness/artroom-contract";
