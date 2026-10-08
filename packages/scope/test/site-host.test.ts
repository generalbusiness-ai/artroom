import { expect, test } from "vitest";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import { otherLane } from "@generalbusiness/artroom-derive/testing";
import { readerOf, type Room, type SiteEnv } from "../src/site/host.ts";
import type { Binding } from "../src/namespace.ts";

const ACCOUNT = { id: 17, login: "demo-owner", type: "Organization" } as const;
const TOKEN = "ghs_scripted_site_read";
const room: Room = { register: otherLane.scope, repository: { host: "github.com", namespace: ACCOUNT.login, name: "demo", id: "71" }, branch: "main" };
const environment = (publicReads: boolean): SiteEnv => ({ SCOPES: {} as Binding, GITHUB_APP_CONFIG: canonicalize({ registerScope: room.register, account: ACCOUNT, maxBytes: 1024 * 1024, publicReads }), GITHUB_READ_TOKEN: TOKEN });
const repository = () => ({ id: 71, name: "demo", owner: ACCOUNT, private: false, full_name: "demo-owner/demo", html_url: "https://github.com/demo-owner/demo", clone_url: "https://github.com/demo-owner/demo.git" });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const packet = (value: string) => `${(new TextEncoder().encode(value).length + 4).toString(16).padStart(4, "0")}${value}`;

// Invariant: Site acquisition requires the recorded stable repository ID
// under the configured account before exposing a Git source, independently
// of public/private read policy. All HTTP/room values are scripted stand-ins;
// the Site adapter, bounded lookup and smart Git parser are actual.
test("scripted GitHub Site acquisition binds stable identity before Git reads and preserves public/private credentials", async () => {
  for (const publicReads of [true, false]) {
    const requests: Request[] = [];
    const open = readerOf(environment(publicReads), room, async (request) => {
      requests.push(request);
      if (new URL(request.url).origin === "https://api.github.com") return json(repository());
      return new Response(`${packet("# service=git-upload-pack\n")}0000${packet(`${"1".repeat(40)} refs/heads/main\0object-format=sha1\n`)}0000`, { headers: { "content-type": "application/x-git-upload-pack-advertisement" } });
    });
    expect(open).not.toBeNull();
    const opened = await open!();
    expect(await opened.source.refs("refs/heads/", 1)).toEqual([{ ref: "refs/heads/main", target: "1".repeat(40) }]);
    expect(requests.map((request) => [request.method, request.url, request.headers.get("authorization")])).toEqual([
      ["GET", "https://api.github.com/repos/demo-owner/demo", publicReads ? null : `Bearer ${TOKEN}`],
      ["GET", "https://github.com/demo-owner/demo.git/info/refs?service=git-upload-pack", publicReads ? null : `Basic ${btoa(`x-access-token:${TOKEN}`)}`],
    ]);
    expect(opened.secrets).toEqual(publicReads ? [] : [TOKEN]);
    await opened.close();
  }
  const { GITHUB_READ_TOKEN: _readToken, ...withoutReadToken } = environment(false);
  expect(readerOf(withoutReadToken, room)).toBeNull();

  // A public replacement under the old name, missing/unexposed identity,
  // unavailable lookup and wrong account never expose a Git source.
  for (const reply of [
    () => json({ ...repository(), id: 72 }),
    () => new Response(null, { status: 404 }),
    () => new Response(null, { status: 503 }),
    () => json({ ...repository(), owner: { ...ACCOUNT, id: 18 } }),
    () => { throw new Error("scripted lookup unavailable"); },
  ]) {
    const requests: string[] = [];
    const open = readerOf(environment(true), room, async (request) => { requests.push(request.url); return reply(); });
    await expect(open!()).rejects.toMatchObject({ step: "info" });
    expect(requests).toEqual(["https://api.github.com/repos/demo-owner/demo"]);
  }
  let invalidRequests = 0;
  const invalid = readerOf(environment(true), { ...room, repository: { ...room.repository, id: "071" } }, async () => { invalidRequests++; return json(repository()); });
  await expect(invalid!()).rejects.toMatchObject({ step: "info" });
  expect(invalidRequests).toBe(0);
});
