import type { ArtroomError, HttpRoom, MemberId, Refusal, Role, Signer } from "@generalbusiness/artroom-contract";
import { expect } from "vitest";
import { connect, generateSigner, isArtroomError, isRefusal, join, type ClientOptions } from "../../src/index.ts";
import { FakeRoom } from "./fake-room.ts";

export type Url = `https://${string}`;

/**
 * The tests' client options: each wait between attempts lasts 1 ms, not the
 * 200 ms and more the client chooses. What is sent, and how often, is the
 * same. room.test.ts checks the waits the client chooses by themselves.
 */
export const FAST: ClientOptions = { backoff: () => 1 };

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
  const joined = await join({ url: room.url as Url }, room.id, { invitation, secret, signer }, { ...FAST, ...opts });
  if (isRefusal(joined)) throw new Error(`join refused: ${joined.rule}`);
  const api = await connect({ url: room.url as Url }, room.id, { kind: "key", signer }, { ...FAST, ...opts });
  return { signer, api };
}

export function sha(c: string): string {
  return c.repeat(40).slice(0, 40);
}

/** The value, or an error that names the refusal. */
export function ok<T>(value: T): Exclude<T, Refusal> {
  if (isRefusal(value)) return expect.fail(`refused: ${value.rule}: ${value.reason}`);
  return value as Exclude<T, Refusal>;
}

/** The `ArtroomError` a promise rejects with. */
export async function caught(p: Promise<unknown>): Promise<ArtroomError> {
  try {
    await p;
  } catch (e) {
    if (isArtroomError(e)) return e;
    throw e;
  }
  return expect.fail("expected an ArtroomError");
}

/** Waits until `test` holds, looking every 2 ms, for at most `ms`. */
export async function until(test: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!test() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 2));
}

/** Waits `ms` of real time: long enough for a 1 ms backoff to have fired many times, if it were going to. */
export const idle = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms));
