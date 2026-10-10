import { expect, test } from "vitest";
import { utf8 } from "@generalbusiness/artroom-bytes";
import { idOf } from "@generalbusiness/artroom-git";
import { decodePack, type DecodedObject } from "@generalbusiness/artroom-git/http-read";
import { Hub, MAX_BYTES, OwnGit } from "./hosts.ts";

// Fixture mechanism only: the real pack builder/decoder over OwnGit's mutable
// object map, then Hub's public-read path using the same pack helper.
// No native publication, real GitHub or membership authority is supplied here.
test("OwnGit reuses only ordered immutable pack bytes while each request checks its token and gets a fresh response", async () => {
  const host = new OwnGit();
  await host.ns.create("pack-cache");
  const binding = await host.ns.get(host.name!);
  const minted = await binding.createToken("read", 120) as { plaintext: string };
  const request = (token = minted.plaintext) => new Request(`${host.remote(host.name!)}/git-upload-pack`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: "scripted want" });
  const blob = (text: string): DecodedObject => {
    const data = utf8(text);
    return { id: idOf("blob", data), type: "blob", data };
  };
  const decoded = async (response: Response) => {
    expect([response.status, response.headers.get("content-type")]).toEqual([200, "application/x-git-upload-pack-result"]);
    const wire = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(wire.subarray(0, 8))).toBe("0008NAK\n");
    return decodePack(wire.subarray(8), { maxBytes: MAX_BYTES });
  };
  let builds = 0;
  const rebuilt = () => expect(host.packBuilds).toBe(++builds);
  const reused = () => expect(host.packBuilds).toBe(builds);
  const first = blob("first");
  host.objects.set(first.id, first);
  // Both requests start before either compression/response completes.
  const one = host.fetch(request()); const two = host.fetch(request());
  rebuilt();
  const [a, b] = await Promise.all([one, two]);
  expect(a).not.toBe(b);
  expect(await decoded(a)).toEqual([first]);
  expect(await decoded(b)).toEqual([first]); reused();

  const replacement = blob("other");
  host.objects.set(first.id, replacement); // Same count and map key.
  const snapshot = { ...replacement, data: new Uint8Array(replacement.data) };
  const copying = host.fetch(request()); rebuilt();
  // Mutation before the request settles cannot change its owned snapshot.
  replacement.data[0] = 0x61;
  expect(await decoded(await copying)).toEqual([snapshot]);
  await expect(host.fetch(request())).rejects.toMatchObject({ reason: "hash-mismatch" }); rebuilt();
  await expect(host.fetch(request())).rejects.toMatchObject({ reason: "hash-mismatch" }); rebuilt();

  // An old rejected build must not clear the new valid snapshot's promise.
  const rejected = expect(host.fetch(request())).rejects.toMatchObject({ reason: "hash-mismatch" }); rebuilt();
  host.objects.set(first.id, first);
  const repaired = host.fetch(request()); rebuilt();
  await rejected;
  expect(await decoded(await repaired)).toEqual([first]);
  expect(await decoded(await host.fetch(request()))).toEqual([first]); reused();

  const second = blob("second");
  host.objects.set(second.id, second);
  expect(await decoded(await host.fetch(request()))).toEqual([first, second]); rebuilt();
  host.objects.delete(first.id); host.objects.set(first.id, first);
  expect(await decoded(await host.fetch(request()))).toEqual([second, first]); rebuilt();
  host.objects.delete(second.id);
  expect(await decoded(await host.fetch(request()))).toEqual([first]); rebuilt();
  host.objects.clear();
  expect(await decoded(await host.fetch(request()))).toEqual([]); rebuilt();

  // Cache construction still uses the real bounds and runtime type checks.
  const large = new Uint8Array(MAX_BYTES + 1);
  const oversized = { id: idOf("blob", large), type: "blob" as const, data: large };
  host.objects.set(oversized.id, oversized);
  await expect(host.fetch(request())).rejects.toMatchObject({ reason: "too-large" }); rebuilt();
  host.objects.clear();
  const tag = { id: idOf("tag", utf8("unsupported")), type: "tag" as const, data: utf8("unsupported") };
  host.objects.set(tag.id, tag);
  await expect(host.fetch(request())).rejects.toMatchObject({ reason: "wrong-type" }); rebuilt();
  host.objects.clear(); host.objects.set(first.id, first);
  expect(await decoded(await host.fetch(request()))).toEqual([first]); rebuilt();

  // A ref-only change alters fresh advertisements, never the cached object pack.
  host.refs.set("refs/heads/main", first.id);
  const refs = () => new Request(`${host.remote(host.name!)}/info/refs?service=git-upload-pack`, { headers: { authorization: `Bearer ${minted.plaintext}` } });
  expect(await (await host.fetch(refs())).text()).toContain(" refs/heads/main\0");
  host.refs.delete("refs/heads/main"); host.refs.set("refs/heads/later", first.id);
  expect(await (await host.fetch(refs())).text()).toContain(" refs/heads/later\0");
  expect(await decoded(await host.fetch(request()))).toEqual([first]); reused();
  await binding.revokeToken(minted.plaintext);
  expect((await host.fetch(request())).status).toBe(401);
  expect((await host.fetch(request("unknown-token"))).status).toBe(401); reused();

  // Hub reads are public. The same owned helper supplies its bytes, while
  // responses and ref advertisements are fresh without minting a write token.
  const hub = new Hub();
  hub.name = "pack-cache";
  const remote = `https://github.com/generalbusiness-ai/${hub.name}.git`;
  const publicRead = () => new Request(`${remote}/git-upload-pack`, { method: "POST", body: "scripted want" });
  const hubFirst = blob("public first");
  const hubSnapshot = { ...hubFirst, data: new Uint8Array(hubFirst.data) };
  hub.objects.set(hubFirst.id, hubFirst);
  const publicOne = hub.fetch(publicRead()); const publicTwo = hub.fetch(publicRead());
  expect(hub.packBuilds).toBe(1);
  // An in-place mutation before completion cannot change either owned pack.
  hubFirst.data[0] = 0x61;
  const [publicA, publicB] = await Promise.all([publicOne, publicTwo]);
  expect(publicA).not.toBe(publicB);
  expect(await decoded(publicA)).toEqual([hubSnapshot]);
  expect(await decoded(publicB)).toEqual([hubSnapshot]);
  await expect(hub.fetch(publicRead())).rejects.toMatchObject({ reason: "hash-mismatch" });
  expect(hub.packBuilds).toBe(2);
  // A rejection is evicted, and an old rejection cannot erase a newer build.
  const publicRejected = expect(hub.fetch(publicRead())).rejects.toMatchObject({ reason: "hash-mismatch" });
  hub.objects.set(hubFirst.id, hubSnapshot);
  const publicRepaired = hub.fetch(publicRead());
  await publicRejected;
  expect(await decoded(await publicRepaired)).toEqual([hubSnapshot]);
  expect(hub.packBuilds).toBe(4);
  expect(await decoded(await hub.fetch(publicRead()))).toEqual([hubSnapshot]);
  expect(hub.packBuilds).toBe(4);
  const publicRefs = () => new Request(`${remote}/info/refs?service=git-upload-pack`);
  hub.refs.set("refs/heads/main", hubSnapshot.id);
  const beforeRefs = await hub.fetch(publicRefs());
  hub.refs.delete("refs/heads/main"); hub.refs.set("refs/heads/later", hubSnapshot.id);
  const afterRefs = await hub.fetch(publicRefs());
  expect(beforeRefs).not.toBe(afterRefs);
  expect(await beforeRefs.text()).toContain(" refs/heads/main\0");
  expect(await afterRefs.text()).toContain(" refs/heads/later\0");
  expect(await decoded(await hub.fetch(publicRead()))).toEqual([hubSnapshot]);
  expect(hub.packBuilds).toBe(4);
  expect([hub.minted, hub.mintedPermissions, [...hub.revoked], hub.pushes]).toEqual([[], [], [], []]);
});
