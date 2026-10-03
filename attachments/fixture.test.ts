/** Planner paired signed-JSON input controls; local FakeRoom only. */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type Binding } from "@generalbusiness/artroom-contract";
import { isArtroomError, type HttpRoomClient, type PreparedAct } from "../src/index.ts";
import { FakeRoom } from "./support/fake-room.ts";
import { joinAs, startRoom } from "./support/setup.ts";
let room: FakeRoom;
let api: HttpRoomClient;
beforeEach(async () => { ({ room } = await startRoom()); api = (await joinAs(room, "@alice")).api as HttpRoomClient; });
afterEach(() => room.stop());
const binding = `sha256:${"0".repeat(64)}` as Binding;
class Question { text = "question"; }
describe("planner signed-JSON profile at preparation", () => {
  for (const [name, body] of [["custom prototype", new Question()], ["nonempty typed array", { text: new Uint8Array([1]) }], ["Date", { text: new Date(0) }]] as const) {
    test(`${name} keeps the existing bad-request refusal before sending`, async () => {
      const before = room.requests.length;
      let prepared: PreparedAct | undefined;
      const result = await api.act("ask", null as never, body as never, { binding, onPrepared: p => { prepared = p; } }).catch(e => e as unknown);
      console.info(JSON.stringify({ probe: name, result, thrownName: result instanceof Error ? result.name : null, thrownMessage: result instanceof Error ? result.message : null, sends: room.requests.slice(before).filter(r => r.method === "POST" && r.route === "/acts").length, prepared: prepared !== undefined }));
      expect(isArtroomError(result) && result.code, "outside signed-JSON inputs remain a client bad-request").toBe("bad-request");
      expect(prepared).toBeUndefined();
      expect(room.requests.slice(before).filter(r => r.method === "POST" && r.route === "/acts")).toHaveLength(0);
    });
  }
  test("plain data still reaches admission without a preparation error", async () => {
    const before = room.requests.length;
    let prepared: PreparedAct | undefined;
    const result = await api.act("ask", null as never, { text: "question" }, { binding, onPrepared: p => { prepared = p; } }).catch(e => e as unknown);
    console.info(JSON.stringify({ probe: "plain control", result, prepared: prepared !== undefined }));
    expect(prepared?.body).toEqual({ text: "question" });
    expect(room.requests.slice(before).filter(r => r.method === "POST" && r.route === "/acts")).toHaveLength(1);
  });
});
