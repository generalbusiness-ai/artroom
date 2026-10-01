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
 */

export { connect, join, redeem, roomIdOf, LOST_REDEMPTION } from "./connect.ts";
export { HttpRoomClient, RpcRoomClient, WS_PROTOCOL, WS_TOKEN_PREFIX } from "./room.ts";
export type { ClientOptions } from "./wire.ts";
export { canonicalize, canonicalBytes, digestOf } from "./canonical.ts";
export { buildEnvelope, signEnvelope, signRequest, type Identity } from "./envelope.ts";
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
