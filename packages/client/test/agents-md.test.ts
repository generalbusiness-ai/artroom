/** The generated AGENTS.md block: under 30 lines, in both forms. */

import { expect, test } from "vitest";
import { agentsMd, AGENTS_MD_BEGIN, AGENTS_MD_END } from "../src/index.ts";

test.each([
  ["the CLI", { room: "acme/web" }, ["artroom claim", "artroom workspace", "git push", "artroom propose", "artroom land --wait", "--idempotency-key"]],
  ["MCP", { room: "acme/web", mcp: "https://artroom.example/v1/rooms/room_1/mcp" }, ["`claim`", "`workspace`", "`propose`", "`land`", "idempotencyKey", "/mcp"]],
] as const)("the %s block teaches the loop in under 30 lines", (_name, opts, words) => {
  const block = agentsMd(opts);
  const lines = block.split("\n");
  expect(lines.length).toBeLessThan(30);
  expect(lines[0]).toBe(AGENTS_MD_BEGIN);
  expect(lines.at(-1)).toBe(AGENTS_MD_END);
  for (const w of [...words, "refusal", "fix", "release", "token"]) expect(block).toContain(w);
  for (const line of lines) expect(line.length).toBeLessThanOrEqual(130);
});

test("the MCP block says that every act needs an idempotencyKey and that a retry reuses it (R-API-9, amendment 7)", () => {
  const mcp = agentsMd({ room: "acme/web", mcp: "https://artroom.example/v1/rooms/room_1/mcp" });
  expect(mcp.split("\n")).toContain("- Every act needs an `idempotencyKey`: any unique string. To retry a call, send it again with the same key. It never acts twice.");
  // It no longer says the key matters only after an error: over MCP a call without one is refused.
  expect(mcp).not.toContain("If an error says the act may have been recorded");
  // The command line names the key itself, so its block keeps its own advice.
  const cli = agentsMd({ room: "acme/web" });
  expect(cli.split("\n")).toContain("- If an error says the act may have been recorded, repeat the command with the `--idempotency-key` it names. It never acts twice.");
  expect(cli).not.toContain("Every act needs an `idempotencyKey`");
});
