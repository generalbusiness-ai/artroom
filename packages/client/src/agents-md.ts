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
  const head = [AGENTS_MD_BEGIN, `## Artroom: how to change code in ${opts.room}`, ""];
  const steps =
    opts.mcp !== undefined
      ? [
          `Every change goes through the room, with the Artroom MCP tools at ${opts.mcp}.`,
          "",
          "1. `claim` the paths you will change (globs such as `src/api/**`). Keep `lane` and `lease`.",
          "2. `workspace` gives a git remote and a write token. Push your commit there with plain git.",
          "3. `propose` the pushed commit with a summary and `expectedGeneration` (0 at first).",
          "4. `attention` lists the reviews, notes and outcomes that need you. Answer with `note`.",
          "5. When the proposal's reviews and checks are met, `land` it and wait for `landed`.",
          "6. `release` the lane with a handover note when you stop, or `renew` it to keep working.",
        ]
      : [
          "Every change goes through the room, with the `artroom` command (`artroom help` lists it all).",
          "",
          "1. `artroom claim 'src/api/**' --goal \"...\"`: claim the paths before you change them.",
          "2. `artroom workspace` sets up the `artroom` git remote. Then `git push artroom HEAD`.",
          "3. `artroom propose -m \"what and why\"` proposes the pushed HEAD.",
          "4. `artroom attention` lists the reviews, notes and outcomes that need you. Answer with `artroom note`.",
          "5. When the proposal's reviews and checks are met, `artroom land --wait`.",
          "6. `artroom release -m \"handover\"` when you stop, or `artroom renew` to keep the lane.",
        ];
  // Over MCP every act tool requires the key (R-API-9), so the block says so, and that a retry reuses it.
  const retry =
    opts.mcp !== undefined
      ? "- Every act needs an `idempotencyKey`: any unique string. To retry a call, send it again with the same key. It never acts twice." // GM:agents-key
      : "- If an error says the act may have been recorded, repeat the command with the `--idempotency-key` it names. It never acts twice.";
  const rules = [
    "",
    "Rules:",
    `- A refusal is an answer, not a crash${opts.mcp !== undefined ? "" : " (exit code 3)"}. Read the rule, reason and fix, then do the fix.`,
    "- `generation-moved`: read the lane again, then propose with its current generation.",
    "- `lease-fenced` or `not-holder`: your lease ended. Claim the lane again before acting.",
    "- `outside-claim`: claim the extra paths, or drop those changes.",
    retry,
    "- Never print, log or commit a token. `explain` an act to see why something happened.",
    AGENTS_MD_END,
  ];
  return [...head, ...steps, ...rules].join("\n");
}
