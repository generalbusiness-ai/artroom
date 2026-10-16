import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { DeclaredDefinition, PlatformDefinition } from "@generalbusiness/dap-contract";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { definitionDigest } from "@generalbusiness/artroom-bytes";
import { validateDefinition } from "@generalbusiness/dap-derive";
import { VERSIONS } from "@generalbusiness/dap-platform";
import { change, change3, changeDemo, changeDemo3, issue, issueDemo } from "@generalbusiness/dap-lanes";
import { USAGE } from "../../cli/src/line.ts";
import { counting } from "../../../apps/counter/definition.ts";
import { DESCRIPTION_CHARS, WORDS, actTool, bindingsOf, checkWords, describeAct, listed, surfaceOf, McpService, memoryStore, type DefinitionLike, type Words } from "../src/index.ts";
import { secretSigner } from "@generalbusiness/artroom-client";
import { ACTIVE_DEMO, declared, demoInventory, platformData } from "./support/catalogue.ts";
import { garden } from "./support/garden.ts";

const DOC = readFileSync(new URL("../../../docs/mcp.md", import.meta.url), "utf8");
const repositoryDefinitions = (): [string, DefinitionLike][] => [
  ...Object.keys(VERSIONS).map((v) => [v, platformData(v as PlatformDefinition)] as [string, DefinitionLike]),
  ...[issue, change, change3, issueDemo, changeDemo, changeDemo3, counting, garden].map((d) => [definitionDigest(d as DeclaredDefinition), declared(d as DeclaredDefinition)] as [string, DefinitionLike]),
];

describe("every activity is reachable, and every act renders", () => {
  // Invariant: the words table maps no two kinds of one definition to one surface name; a table that does is refused.
  test("the words table is checked, and a table that merges two kinds is refused", () => {
    expect(() => checkWords(WORDS, repositoryDefinitions().map(([, d]) => d))).not.toThrow();
    const merged: Words = { ...WORDS, acts: { ...WORDS.acts, issue: { ...WORDS.acts["issue"], "close-any": "issue.close", "close-own": "issue.close" } } };
    expect(() => checkWords(merged, [declared(issueDemo)])).toThrow(/maps close-own and close-any of issue to one name, issue.close|maps close-any and close-own of issue to one name, issue.close/);
    // The table maps names only: the platform rows of plan 031, section 3.
    expect(["platform:register found", "platform:directory open-issue", "platform:membership set-role", "platform:destination read-token", "issue take-hold", "issue report", "change propose-manifest"].map((k) => surfaceOf(WORDS, ...(k.split(" ") as [string, string]))))
      .toEqual(["room.create", "issue.create", "member.role", "repository.read-token", "issue.work", "issue.hand-in", "change.propose-version"]);
    expect(surfaceOf(WORDS, "garden", "plant")).toBe("garden.plant");
  });

  // Invariant: rendering is total over every act of every definition in the repository and the unfamiliar one, and every
  // description is at most 1,000 characters.
  test("rendering is total over every act of every definition", () => {
    expect(validateDefinition(garden, PROPOSED_BOUNDS).ok).toBe(true);
    let acts = 0;
    for (const [pinned, definition] of repositoryDefinitions()) {
      for (const [kind, act] of Object.entries(definition.acts)) {
        if (kind === definition.genesis) continue;
        acts++;
        const text = describeAct(definition, kind, act, { standing: "holds", role: "admin" }, { pinned, active: ACTIVE_DEMO }, { definition: definition.name, kind, declaration: "sha256:x", digests: [pinned] }, `inspect with describe: "${kind}"`);
        expect(text.complete, `${definition.name} ${kind}`).not.toContain("the form {");
        expect(text.description.length, `${definition.name} ${kind}`).toBeLessThanOrEqual(DESCRIPTION_CHARS);
      }
    }
    expect(acts).toBeGreaterThan(300);
  });

  // Invariant: every act of a W2 room's definitions that declares a presented fact or a byte-domain value is exercised with that
  // input in a W2 story (each story marks the call with `exercises(...)`).
  test("every act with a presented fact or a value place is exercised with it in W2", () => {
    const held: DefinitionLike[] = [...["platform:directory@3", "platform:rules@2", "platform:directory@5", "platform:rules@3"].map((v) => platformData(v as PlatformDefinition)), declared(change), declared(garden)];
    const owed = new Set<string>();
    for (const d of held) for (const [kind, act] of Object.entries(d.acts)) {
      if (kind === d.genesis) continue;
      if (Object.keys(act.presents ?? {}).length > 0) owed.add(`${d.name} ${kind} presented`);
      if (Object.values(act.fields).some((f) => f.type === "digest" && typeof f["value"] === "object")) owed.add(`${d.name} ${kind} values`);
    }
    const stories = readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".scope.test.ts")).map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
    const marked = new Set([...stories.matchAll(/exercises\("([^"]+)", "([^"]+)", "(presented|values)"\)/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`));
    expect([...owed].filter((o) => !marked.has(o)).sort()).toEqual([]);
  });

  // Invariant: docs/mcp.md maps every command of the command line and every page action to tool calls in each launch mode, and
  // every tool a default recipe names is listed for an admin of the demo room (no recipe names a hidden tool).
  test("the W1 inventory in docs/mcp.md covers every command and page action, with listed tools only", async () => {
    const commands = [...new Set(USAGE.split("\n").filter((l) => l.startsWith("  dap ")).map((l) => l.trim().split(" ").slice(0, l.includes("dap issue ") ? 3 : 2).join(" ")))];
    // The selection must be the command line's real command set, or the coverage loop below checks nothing.
    expect(commands.length).toBeGreaterThanOrEqual(15);
    expect(commands).toEqual(expect.arrayContaining(["dap install", "dap join", "dap issues", "dap merge", "dap mcp"]));
    const table = DOC.slice(DOC.indexOf("## The W1 inventory"), DOC.indexOf("## ", DOC.indexOf("## The W1 inventory") + 5));
    const rows = table.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Activity") && !l.startsWith("|---"));
    for (const command of commands.filter((c) => c !== "dap mcp")) expect(rows.some((r) => r.includes(`\`${command}`)), command).toBe(true);
    for (const action of ["Join with an invitation link", "Create issue", "Comment", "Review", "Merge", "Propose an edit", "Rules editor", "Create room", "Check status", "Record inspection"]) expect(rows.some((r) => r.includes(action)), action).toBe(true);
    const mcp = new McpService({ service: "https://x", signer: secretSigner(new Uint8Array(32)), config: { read: async () => ({ service: "https://x" }), addRoot: async () => {} }, custody: memoryStore(), mode: "add" });
    const generic = (await mcp.page()).tools.map((t) => t.name);
    const inventory = demoInventory("admin");
    const tools = new Set([...generic, ...bindingsOf(inventory, WORDS).filter((b) => listed(b, inventory)).map((b) => actTool(b, inventory, "default").name)]);
    for (const row of rows) {
      const cells = row.split(" | ");
      const named = [...(cells[1] ?? "").matchAll(/`([a-z][a-z0-9.-]*(?:@[0-9a-f]+)?)`/g)].map((m) => m[1]!).filter((n) => !n.startsWith("artroom") && !n.startsWith("git"));
      for (const name of named) expect(tools.has(name) || /@/.test(name), `${cells[0]} names ${name}`).toBe(true);
    }
  });

  // Invariant: the tool reference of docs/mcp.md is what tools/list sends: each generic tool's description and schemas verbatim,
  // and docs/mcp-tools.json the whole list for an admin of the demo room. MCP_WRITE_DOCS=1 writes the file from the derivation.
  test("the tool reference is the list as sent", async () => {
    const mcp = new McpService({ service: "https://x", signer: secretSigner(new Uint8Array(32)), config: { read: async () => ({ service: "https://x" }), addRoot: async () => {} }, custody: memoryStore(), mode: "add" });
    const generic = (await mcp.page()).tools;
    for (const t of generic) {
      expect(DOC, t.name).toContain(`### \`${t.name}\`\n\n${t.description}\n`);
      expect(DOC, t.name).toContain(JSON.stringify({ inputSchema: t.inputSchema, ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}), annotations: t.annotations }, null, 2));
    }
    const inventory = demoInventory("admin");
    const acts = bindingsOf(inventory, WORDS).filter((b) => listed(b, inventory)).map((b) => actTool(b, inventory, "default"));
    for (const t of acts) expect(DOC, t.name).toContain(`| \`${t.name}\` | `);
    const list = `${JSON.stringify({ tools: [...generic.filter((t) => t.name !== "actions" && t.name !== "act"), ...acts] }, null, 2)}\n`;
    const file = new URL("../../../docs/mcp-tools.json", import.meta.url);
    if (process.env["MCP_WRITE_DOCS"] === "1") writeFileSync(file, list);
    expect(readFileSync(file, "utf8")).toBe(list);
  });
});
