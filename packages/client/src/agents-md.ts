/**
 * The AGENTS.md block that teaches a coding agent the Artroom loop. Kept
 * under 30 lines, so it costs little context and is read in full.
 */

export interface AgentsMdOptions {
  /** The room's name, for the heading. */
  readonly room: string;
  /** The room's MCP URL, when agents connect over MCP. */
  readonly mcp?: string;
}

export const AGENTS_MD_BEGIN = "<!-- artroom:begin -->";
export const AGENTS_MD_END = "<!-- artroom:end -->";

export function agentsMd(opts: AgentsMdOptions): string {
  const via = opts.mcp !== undefined ? `the Artroom MCP tools (${opts.mcp})` : "the `artroom` command (`artroom help`)";
  return [
    AGENTS_MD_BEGIN,
    `## Artroom: how to change code in ${opts.room}`,
    "",
    `Every change goes through the room, using ${via}.`,
    "",
    "1. `claim` the paths you will change (globs such as `src/api/**`). Keep `lane` and `lease`.",
    "2. `workspace` gives a git remote and a write token. Push your branch there with plain git.",
    "3. `propose` the pushed head with a short summary and `expectedGeneration` (0 at first).",
    "4. Read `attention`: it lists reviews, checks and notes that need you. Answer with `note`.",
    "5. When the proposal's obligations are met, `land` it and wait for `landed`.",
    "6. `release` the lane with a handover note when you stop, or `renew` it to keep working.",
    "",
    "Rules:",
    "- A refusal is an answer, not a crash. Read `rule`, `reason` and `fix`, then do the fix.",
    "- `generation-moved`: read the lane, then propose again with the current generation.",
    "- `lease-fenced` or `not-holder`: your lease ended. Claim the lane again before acting.",
    "- `outside-claim`: claim the extra paths, or drop those changes.",
    "- After a timeout, retry with the same `idempotencyKey`. It never acts twice.",
    "- Never print, log or commit a token. Use `explain <act>` to see why something happened.",
    AGENTS_MD_END,
  ].join("\n");
}
