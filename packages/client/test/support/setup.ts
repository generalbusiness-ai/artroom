import type { HttpRoom, MemberId, Role, Signer } from "@generalbusiness/artroom-contract";
import { connect, generateSigner, isRefusal, join, type ClientOptions } from "../../src/index.ts";
import { FakeRoom } from "./fake-room.ts";

export type Url = `https://${string}`;

export async function startRoom(): Promise<{ room: FakeRoom; url: Url }> {
  const room = await FakeRoom.create();
  const url = (await room.start()) as Url;
  return { room, url };
}

/** Invites, joins with a fresh key, and connects. */
export async function joinAs(
  room: FakeRoom,
  handle: MemberId,
  role: Role = "member",
  opts: ClientOptions = {},
): Promise<{ signer: Signer; api: HttpRoom }> {
  const { invitation, secret } = await room.invite(handle, { role });
  const { signer } = await generateSigner();
  const joined = await join({ url: room.url as Url }, room.id, { invitation, secret, signer }, opts);
  if (isRefusal(joined)) throw new Error(`join refused: ${joined.rule}`);
  const api = await connect({ url: room.url as Url }, room.id, { kind: "key", signer }, opts);
  return { signer, api };
}

export function sha(c: string): string {
  return c.repeat(40).slice(0, 40);
}
