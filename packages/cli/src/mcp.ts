/**
 * `artroom mcp` under Node: the MCP server of `packages/mcp`, over stdio or loopback HTTP, signing with this config directory's
 * key. The command line owns the config file: the server reads it, and appends a standalone scope after an accepted `create`.
 */

import { secretSigner } from "@generalbusiness/artroom-client";
import { serve } from "@generalbusiness/artroom-mcp/node";
import type { McpConfig, Root } from "@generalbusiness/artroom-mcp";
import { mcpOptions, mcpRoot, type Context, type Outcome } from "./commands.ts";

export async function mcp(ctx: Context, home: string, argv: readonly string[]): Promise<Outcome> {
  const options = mcpOptions(argv);
  if ("code" in options) return options;
  if (options.scope !== null) {
    const added = await mcpRoot(ctx, options.scope, options.membership ?? undefined);
    process.stderr.write(`${added.lines.join("\n")}\n`);
    if (added.code !== 0) return added;
  }
  const config = await ctx.store.config();
  if (!config) return { code: 2, lines: ["No room is set up here. Run: artroom install <base-url>, or artroom join <link>."] };
  const secret = await ctx.store.secret(config.key);
  if (!secret) return { code: 1, lines: [`The key ${config.key} is missing from the config directory; the server cannot sign.`] };
  const port = {
    read: async (): Promise<McpConfig> => {
      const c = await ctx.store.config();
      return { service: c!.service, ...(c!.register ? { register: c!.register } : {}), ...(c!.repository ? { repository: c!.repository } : {}), ...(c!.roots ? { roots: c!.roots } : {}) };
    },
    addRoot: async (root: Root): Promise<void> => {
      const c = (await ctx.store.config())!;
      await ctx.store.save({ ...c, roots: [...(c.roots ?? []).filter((r) => r.scope !== root.scope), root] });
    },
  };
  try {
    await serve({ service: config.service, signer: secretSigner(secret), config: port, home, mode: options.mode, tools: options.tools, http: options.http, ...(ctx.fetch ? { fetch: ctx.fetch } : {}) });
  } catch (error) {
    return { code: 2, lines: [error instanceof Error ? error.message : String(error)] };
  }
  return { code: 0, lines: [] };
}
