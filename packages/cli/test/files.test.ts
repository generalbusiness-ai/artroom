import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { b64url } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { fileStore } from "../src/files.ts";
import { command } from "../src/line.ts";

// Invariant: a key the command makes is kept owner-only and never replaced, and no line the command prints holds it.
test("install keeps its operator key owner-only under the config directory, refuses to replace it, and prints only the key's ID; a refused founding is printed with its reason", async () => {
  const dir = join(mkdtempSync(join(tmpdir(), "artroom-cli-")), "artroom");
  const store = fileStore(dir);
  // A service that refuses every founding: what it answers is not the point here, only what the command keeps and prints.
  const fetch: Fetch = async () => new Response(JSON.stringify({ answer: "refused", reason: "unauthorized" }), { status: 403 }) as never;
  const outcome = await command({ store, fetch }, ["install", "https://service.test"]);
  expect(outcome).toEqual({ code: 1, lines: ["Refused: unauthorized. Nothing was written."] });

  const path = join(dir, "keys", "operator.key");
  expect([statSync(dir).mode & 0o777, statSync(join(dir, "keys")).mode & 0o777, statSync(path).mode & 0o777]).toEqual([0o700, 0o700, 0o600]);
  const secret = (await store.secret("operator"))!;
  expect([secret.length, readFileSync(path, "utf8")]).toEqual([32, `${b64url(secret)}\n`]);
  await expect(store.keep("operator", new Uint8Array(32))).rejects.toThrow(/exists already; it is not replaced/);
  expect(await store.secret("operator")).toEqual(secret);
  // A second install reuses the kept key: the same intent's actor, and the secret is in no line.
  const again = await command({ store, fetch }, ["install", "https://service.test"]);
  expect(again.lines.join("\n")).not.toContain(b64url(secret));
});
