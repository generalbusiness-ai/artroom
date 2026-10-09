import { expect, test } from "vitest";
import { RoomOpening, roomContext, routeOf } from "../src/shell.ts";

test("navigation keeps lane identity and separates the room's Issues and Changes lists", () => {
  expect(routeOf("#/")).toEqual({ destination: "issues", scope: null });
  expect(routeOf("#/?kind=change")).toEqual({ destination: "changes", scope: null });
  expect(routeOf("#/change/sc_exact?kind=issue")).toEqual({ destination: "changes", scope: "sc_exact" });
  expect(routeOf("#/issue/sc_other")).toEqual({ destination: "issues", scope: "sc_other" });
  expect(routeOf("#/rules")).toEqual({ destination: "rules", scope: null });
});

test("a late read from the previous room cannot replace the active room or reuse another membership incarnation", async () => {
  const cache = new RoomOpening<string>();
  const place = { directory: "directory", membership: { scope: "membership", kind: "membership", inc: "one" } };
  const key = roomContext("origin", place, "device");
  const next = roomContext("origin", { ...place, membership: { ...place.membership, inc: "two" } }, "device");
  let finish!: (value: string) => void;
  const old = cache.get(key, () => new Promise<string>((resolve) => { finish = resolve; }));
  const active = cache.get(next, () => Promise.resolve("active"));
  finish("old");
  expect(await old).toBe("old");
  expect(cache.get(next, () => { throw new Error("Must reuse the active pending read"); })).toBe(active);
  expect(await active).toBe("active");
  expect(roomContext("origin", place, "another device")).not.toBe(key);
  cache.clear();
  expect(await cache.get(next, () => Promise.resolve("reopened"))).toBe("reopened");
  let refuse!: (reason: Error) => void;
  const failedOld = cache.get(key, () => new Promise<string>((_resolve, reject) => { refuse = reject; }));
  const replacement = cache.get(next, () => Promise.resolve("replacement"));
  refuse(new Error("Old room is unreadable"));
  await expect(failedOld).rejects.toThrow("Old room is unreadable");
  expect(cache.get(next, () => { throw new Error("Old failure must not clear the active room"); })).toBe(replacement);
});
