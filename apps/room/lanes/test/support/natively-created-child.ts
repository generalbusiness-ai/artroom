/** Actual Native issue children. Git/clock/scheduler remain the Room fixture's labelled stand-ins. */
import { env } from "cloudflare:workers";
import { onTestFinished } from "vitest";
import { canonicalize, factRefOf, intentDigest, isSeed, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, declaredHandle, type Signed } from "@generalbusiness/artroom-client";
import type { Receipt, Seed } from "@generalbusiness/dap-contract";
import { issue } from "../../src/index.ts";
import { Platform } from "../../../../../packages/scope/test/repository.ts";
import { wired } from "../../../../../packages/scope/test/outside.ts";
import { Host, Node, reader } from "./graph.ts";
import { platformTransport, settle, valid, type Room } from "./room.ts";

const children = new WeakMap<Room, Platform[]>();

/** Dispatch the room and every actual concern child registered by this helper. */
export function settleNativeChildren(room: Room): Promise<void> {
  return settle(...room.scopes, ...(children.get(room) ?? []));
}

/** Wire the exact predicted child before submitting, then verify the actual Native creation. */
export async function nativelyCreatedChild(room: Room, parent: Node<typeof issue>, signed: Signed): Promise<{ child: Node<typeof issue>; receipt: Receipt }> {
  const intent = signed.signed.intent;
  if (intent.kind !== "add-concern" || canonicalize(intent.to) !== canonicalize(parent.at)) throw new Error("Native child must follow an add-concern signed for its actual parent");
  const seed: Seed = { v: 1, kind: "lane", definition: parent.valid.digest, creator: parent.at, cause: intentDigest(intent), ordinal: 0 };
  const name = scopeIdOf(seed), child = new Platform(name);
  const host = new Host();
  room.hosts.set(name, host);
  wired.set(name, () => ({ outside: { accepts: (owner, kind) => host.accepts(owner, kind), send: request => Promise.resolve(host.send(request)) } }));
  onTestFinished(() => { wired.delete(name); });
  const owned = children.get(room) ?? [];
  owned.push(child);
  children.set(room, owned);
  // Accepted acts start background dispatch. The Host must therefore be
  // installed before this submission, as Room.lane installs its host.
  const answer = await parent.submit(signed);
  if (answer.answer !== "accepted") throw new Error(`Native add-concern was not accepted: ${JSON.stringify(answer)}`);
  const receipt = answer.receipt, entry = await parent.entry(receipt.fact.seq);
  if (canonicalize(factRefOf(entry)) !== canonicalize(receipt.fact) || canonicalize(receipt.fact.at) !== canonicalize(parent.at)
    || entry.input.type !== "act" || canonicalize(entry.input.signed) !== canonicalize(signed.signed)) throw new Error("Native add-concern receipt must name the actual signed parent entry");
  const creates = entry.sends.filter(send => send.message.class === "request" && send.message.type === "create" && isSeed(send.to));
  if (creates.length !== 1 || canonicalize(creates[0]!.to) !== canonicalize(seed)) throw new Error("Native add-concern must record exactly its predicted creation seed");
  await settleNativeChildren(room);
  const checked = await declaredHandle(new ScopeHandle(platformTransport, name, reader), issue);
  if (!checked.ok) throw new Error(`Native concern handle unavailable: ${JSON.stringify(checked)}`);
  return { child: new Node(checked.handle, valid(issue), env.PLATFORM), receipt };
}
