/**
 * The client implements what the contract declares (section 22, point 23):
 * `connect`, `join` and `redeem` have the declared types, and the handles
 * are the contract's `HttpRoom` and `Room`. Checked by `npm run typecheck`.
 */

import { expect, test } from "vitest";
import type * as Declared from "@generalbusiness/artroom-contract/client";
import type { HttpRoom, Room } from "@generalbusiness/artroom-contract";
import { connect, HttpRoomClient, join, redeem, RpcRoomClient } from "../src/index.ts";

const declaredConnect: typeof Declared.connect = connect;
const declaredJoin: typeof Declared.join = join;
const declaredRedeem: typeof Declared.redeem = redeem;
const httpRoom = (h: HttpRoomClient): HttpRoom => h;
const rpcRoom = (r: RpcRoomClient): Room => r;

test("connect, join and redeem have the contract's declared types", () => {
  expect([declaredConnect, declaredJoin, declaredRedeem, httpRoom, rpcRoom].every((f) => typeof f === "function")).toBe(true);
});
