/**
 * The client implements what the contract declares (section 22, point 23):
 * `connect`, `join` and `redeem` have the declared types, and the handles
 * are the contract's `HttpRoom` and `Room`.
 *
 * This file has no test to run. `npm run typecheck` checks it: an
 * assignment below stops compiling if the client and the contract part.
 */

import type * as Declared from "@generalbusiness/artroom-contract/client";
import type { HttpRoom, Room } from "@generalbusiness/artroom-contract";
import { connect, join, redeem, type HttpRoomClient, type RpcRoomClient } from "../src/index.ts";

export const declaredConnect: typeof Declared.connect = connect;
export const declaredJoin: typeof Declared.join = join;
export const declaredRedeem: typeof Declared.redeem = redeem;
export const httpRoom = (h: HttpRoomClient): HttpRoom => h;
export const rpcRoom = (r: RpcRoomClient): Room => r;
