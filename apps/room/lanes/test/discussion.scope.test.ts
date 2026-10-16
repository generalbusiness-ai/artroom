import { expect, test } from "vitest";
import { textDigest } from "@generalbusiness/artroom-bytes";
import { ShapeError } from "@generalbusiness/artroom-client";
import { answered, graph, paul, rita, sam, una, vic } from "./support/graph.ts";

test("T6, bounded attention inside the application: a comment tells the members it names, each once, and nobody else; it sends nothing out of the lane; a seventeenth mention is refused by the client's handle and by the scope", async () => {
  // One real `issue` lane, at the client, the turn and the store. No capability and no peer is used. Not proved: an inbox, or any
  // delivery of a notice to a member. An attention effect is a record in the lane's entry, and nothing here reads it elsewhere.
  const g = await graph();
  const G = await g.goal();
  const body = "Please look, @una and @vic.";
  const duties = (await G.duties()).length;
  const said = await G.did(rita, "comment", { fields: { body, mentions: [una.member, vic.member, una.member] } });
  // One attention effect, for exactly the two members named, with a member named twice told once. The author is not told.
  expect(said.effects.filter((e) => e.effect === "attention")).toEqual([{ effect: "attention", item: said.fact.seq, members: [una.member, vic.member], reason: "mentioned" }]);
  expect((await G.item(said.fact.seq)).parties).toEqual({ author: rita.member, mentioned: [una.member, vic.member] });
  // The entry holds the digest of the body, and the scope keeps the text beside it. Nothing left the lane: no send, and no new duty.
  expect([said.sends, (await G.duties()).length, (await G.handle.scope.text(textDigest(body))).ok]).toEqual([[], duties, true]);
  // A reply that names nobody tells nobody: not the author of the comment it answers, and not the requester of the goal.
  const reply = await G.did(paul, "comment", { fields: { body: "A reply.", replyTo: said.fact.seq } });
  expect(reply.effects.map((e) => e.effect)).toEqual(["open", "party", "value", "ref"]);

  // The list is bounded at 16. The handle refuses a longer one before it signs, and the scope refuses the same intent signed without it.
  const many = Array.from({ length: 17 }, (_, i) => ({ ...sam.member, member: `@m${i}` as typeof sam.member.member }));
  const head = (await G.entries()).length;
  await expect(G.act(rita, "comment", { fields: { body: "Everyone.", mentions: many } })).rejects.toThrow(ShapeError);
  expect([answered(await G.raw(rita, "comment", { body: textDigest("Everyone."), mentions: many })), (await G.entries()).length]).toEqual(["bad-field", head]);
});
