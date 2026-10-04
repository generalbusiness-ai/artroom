/**
 * Request 55be0661, item 1 (finding SEC-04): `PUBLIC_URL` is required, with
 * no fallback host. Redemption puts it in `Redeemed.mcp`, and the CLI
 * prints a command that sends the bearer token there; a placeholder would
 * send it to whoever holds that name. The Worker and the Room refuse to
 * start without it (test/workerd/hygiene-55be0661.test.ts), and the
 * deployable config carries no placeholder.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicUrl } from "../../src/config.ts";
import { readJsonc } from "./jsonc.ts";

describe("publicUrl", () => {
  it("is the https:// origin it was given", () => {
    expect(publicUrl({ PUBLIC_URL: "https://artroom-spike-room.inguz.workers.dev" })).toBe("https://artroom-spike-room.inguz.workers.dev");
    expect(publicUrl({ PUBLIC_URL: "https://room.example.com:8443" })).toBe("https://room.example.com:8443");
  });

  it("refuses a PUBLIC_URL that is not set, or is anything but an https:// origin in normal form", () => {
    for (const [why, v] of [
      ["not set", undefined],
      ["empty", ""],
      ["not a URL", "artroom.example.workers.dev"],
      ["plain http", "http://room.example.com"],
      ["a trailing slash", "https://room.example.com/"],
      ["a path", "https://room.example.com/base"],
      ["a query", "https://room.example.com?x=1"],
      ["a fragment", "https://room.example.com#x"],
      ["credentials", "https://user@room.example.com"],
      ["an upper-case host, not in normal form", "https://Room.example.com"],
    ] as const)
      expect(() => publicUrl(v === undefined ? {} : { PUBLIC_URL: v }), why).toThrow(/PUBLIC_URL must be this deployment's https:\/\/ origin/);
  });
});

describe("the deployable configs", () => {
  const read = (file: string) => readJsonc<{ vars: Record<string, string> }>(file, import.meta.url);

  it("wrangler.jsonc has no PUBLIC_URL, so a deploy must give its own, and names no example host anywhere", () => {
    expect(read("../../wrangler.jsonc").vars["PUBLIC_URL"]).toBeUndefined();
    expect(readFileSync(new URL("../../wrangler.jsonc", import.meta.url).pathname, "utf8")).not.toMatch(/example\.workers\.dev/);
  });

  it("the spike's PUBLIC_URL is one the Worker starts with", () => {
    expect(() => publicUrl(read("../../wrangler.spike.jsonc").vars)).not.toThrow();
  });
});
