/** Actual Native issue children. Git/clock/scheduler remain the Room fixture's labelled stand-ins. */
import { env } from "cloudflare:workers";
import { onTestFinished } from "vitest";
import { isSeed, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, declaredHandle } from "@generalbusiness/artroom-client";
import { issue } from "../../src/index.ts";
import { Platform } from "../../../scope/test/repository.ts";
import { wired } from "../../../scope/test/outside.ts";
import { Host, Node, reader } from "./graph.ts";
import { platformTransport, settle, valid, type Room } from "./room.ts";

const children = new WeakMap<Room, Platform[]>();

/** Dispatch the room and every actual concern child registered by this helper. */
export function settleNativeChildren(room: Room): Promise<void> {
  return settle(...room.scopes, ...(children.get(room) ?? []));
}

/** Read the actual add-concern send, wire its host, and follow the genuine Native creation. */
export async function nativelyCreatedChild(room: Room, parent: Node<typeof issue>, seq: number): Promise<Node<typeof issue>> {
  const entry = await parent.entry(seq);
  if (entry.input.type !== "act" || entry.input.signed.intent.kind !== "add-concern") throw new Error("Native child must follow the actual add-concern act");
  const creates = entry.sends.filter(send => send.message.class === "request" && send.message.type === "create" && isSeed(send.to));
  if (creates.length !== 1 || !isSeed(creates[0]!.to)) throw new Error("add-concern must record exactly one actual creation seed");
  const name = scopeIdOf(creates[0]!.to), child = new Platform(name);
  const host = new Host();
  room.hosts.set(name, host);
  wired.set(name, () => ({ outside: { accepts: (owner, kind) => host.accepts(owner, kind), send: request => Promise.resolve(host.send(request)) } }));
  onTestFinished(() => { wired.delete(name); });
  const owned = children.get(room) ?? [];
  owned.push(child);
  children.set(room, owned);
  await settleNativeChildren(room);
  const checked = await declaredHandle(new ScopeHandle(platformTransport, name, reader), issue);
  if (!checked.ok) throw new Error(`Native concern handle unavailable: ${JSON.stringify(checked)}`);
  return new Node(checked.handle, valid(issue), env.PLATFORM);
}
