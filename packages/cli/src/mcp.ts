/**
 * `dap mcp` under Node: the MCP server of `packages/mcp`, over stdio or loopback HTTP, signing with this config directory's
 * key. The command line owns the config file: the server reads it, and appends a standalone scope after an accepted `create`.
 */

import type { ScopeRef } from "@generalbusiness/dap-contract";
import { isScopeId } from "@generalbusiness/artroom-bytes";
import { httpTransport, secretSigner, signedReads } from "@generalbusiness/artroom-client";
import { serve } from "@generalbusiness/dap-mcp/node";
import type { McpConfig, Root } from "@generalbusiness/dap-mcp";
import type { Context, Outcome } from "./commands.ts";

const usage = (...lines: string[]): Outcome => ({ code: 2, lines });

/** The options of `dap mcp`, read from its command line; a usage outcome when they cannot be read. */
export interface McpOptions { mode: "default" | "generic" | "add"; tools: string[] | null; http: { host: string; port: number } | null; scope: string | null; membership: string | null }
export function mcpOptions(argv: readonly string[]): McpOptions | Outcome {
  const options: McpOptions = { mode: "default", tools: null, http: null, scope: null, membership: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = (): string | null => argv[++i] ?? null;
    if (arg === "--generic") options.mode = "generic";
    else if (arg === "--generic=add") options.mode = "add";
    else if (arg === "--tools") { const v = value(); if (!v) return usage("--tools takes definition names, separated by commas."); options.tools = v.split(",").map((t) => t.trim()).filter((t) => t.length > 0); }
    else if (arg === "--http") {
      const v = value();
      const match = v ? /^(.+):(\d{1,5})$/.exec(v) : null;
      if (!match) return usage("--http takes <loopback address>:<port>, such as 127.0.0.1:8765.");
      options.http = { host: match[1]!, port: Number(match[2]) };
    }
    else if (arg === "--scope") { const v = value(); if (!v) return usage("--scope takes a scope ID."); options.scope = v; }
    else if (arg === "--membership") { const v = value(); if (!v) return usage("--membership takes a scope."); options.membership = v; }
    else return usage(`mcp takes no ${arg}.`);
  }
  if (options.membership !== null && options.scope === null) return usage("--membership goes with --scope.");
  return options;
}

/**
 * `dap mcp --scope <scope> --membership <scope>`: append one standalone scope to the config, for the MCP server to list its
 * acts. The membership is the scope that standing for it is read from: `membership` for the room's own, or a scope ID, whose
 * incarnation is read from its summary by a signed read. The scope itself is not read here: the server reads it when it lists.
 */
export async function mcpRoot(ctx: Context, scope: string, membership: string | undefined): Promise<Outcome> {
  const config = await ctx.store.config();
  if (!config) return usage("No room is set up here. Run: dap install <base-url>, or dap join <link>.");
  if (!isScopeId(scope)) return usage(`--scope takes a scope ID, not ${scope}.`);
  let ref: ScopeRef | null = null;
  if (membership !== undefined) {
    const named = membership === "membership" ? config.repository?.membership.scope : membership;
    if (!named || !isScopeId(named)) return usage(`--membership takes membership or a scope ID, not ${membership}.`);
    if (config.repository?.membership.scope === named) ref = config.repository.membership;
    else {
      const secret = await ctx.store.secret(config.key);
      if (!secret) return { code: 1, lines: [`The key ${config.key} is missing from the config directory; nothing was read.`] };
      const read = await signedReads(httpTransport(config.service, ctx.fetch ? { fetch: ctx.fetch } : {}), secretSigner(secret), ctx.now ? { now: ctx.now } : {}).summary(named, null);
      if (!read.ok) return { code: 1, lines: [`Cannot read ${named}: ${read.reason}. Nothing was recorded.`] };
      ref = read.value.scope;
    }
    if (ref.kind !== "membership") return usage(`${named} is no membership scope.`);
  }
  const roots = (config.roots ?? []).filter((root) => root.scope !== scope);
  await ctx.store.save({ ...config, roots: [...roots, { scope, membership: ref }] });
  return { code: 0, lines: [`Standalone scope ${scope}${ref ? `, standing read from ${ref.scope}` : ", standing unknown"}: recorded for the MCP server.`] };
}

export async function mcp(ctx: Context, home: string, argv: readonly string[]): Promise<Outcome> {
  const options = mcpOptions(argv);
  if ("code" in options) return options;
  if (options.scope !== null) {
    const added = await mcpRoot(ctx, options.scope, options.membership ?? undefined);
    process.stderr.write(`${added.lines.join("\n")}\n`);
    if (added.code !== 0) return added;
  }
  // A configuration that has joined nothing yet is served too: its key is made and kept as `dap join` makes it, and the
  // server's `join` records the room, the service and the handle when an invitation is accepted.
  const config = await ctx.store.config();
  const keyName = config?.key ?? "device";
  let secret = await ctx.store.secret(keyName);
  if (!secret && config) return { code: 1, lines: [`The key ${config.key} is missing from the config directory; the server cannot sign.`] };
  if (!secret) { secret = crypto.getRandomValues(new Uint8Array(32)); await ctx.store.keep(keyName, secret); }
  const port = {
    read: async (): Promise<McpConfig> => {
      const c = await ctx.store.config();
      if (!c) return { service: "" };
      return { service: c.service, ...(c.handle ? { handle: c.handle } : {}), ...(c.register ? { register: c.register } : {}), ...(c.repository ? { repository: c.repository } : {}), ...(c.roots ? { roots: c.roots } : {}) };
    },
    setRepository: async (repository: NonNullable<McpConfig["repository"]>): Promise<void> => {
      const c = (await ctx.store.config())!;
      await ctx.store.save({ ...c, repository });
    },
    joined: async (room: { service: string; repository: NonNullable<McpConfig["repository"]>; handle: string }): Promise<void> => {
      const c = await ctx.store.config();
      await ctx.store.save({ ...(c ?? { v: 1 as const, key: keyName }), service: room.service, repository: room.repository, handle: room.handle });
    },
    addRoot: async (root: Root): Promise<void> => {
      const c = (await ctx.store.config())!;
      await ctx.store.save({ ...c, roots: [...(c.roots ?? []).filter((r) => r.scope !== root.scope), root] });
    },
  };
  try {
    await serve({ service: config?.service ?? "", signer: secretSigner(secret), config: port, home, mode: options.mode, tools: options.tools, http: options.http, ...(ctx.fetch ? { fetch: ctx.fetch } : {}) });
  } catch (error) {
    return { code: 2, lines: [error instanceof Error ? error.message : String(error)] };
  }
  return { code: 0, lines: [] };
}
