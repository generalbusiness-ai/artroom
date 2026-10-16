# Design proposal: repo coordination within your existing AI app

We propose a hosted dap service that coordinates people and coding agents
around a repo, through ChatGPT, Claude, or Slack. Each person uses their own
conversation. MCP Apps supplies views for shared work and decisions.

## What dap adds to an assistant connected to GitHub

An assistant with GitHub tools can already inspect source and work with
issues, pull requests, and reviews. GitHub supplies shared records and merge
controls. Coding from chat and showing a diff are established capabilities.

Dap's proposed value is that **a decision made in one conversation directs
work in other agent sessions**. It records who may decide, which tasks wait,
and what those agents must do after the answer. The hosted service saves
work, waits, and resumes the affected assignments. A replacement agent
receives the same agreement and rationale.

The person returns to their own assistant to understand the situation and
decide. They do not carry answers between agent sessions or configure that
coordination themselves. GitHub can support custom automation for similar
processes. Dap must earn adoption by making this complete process useful
and easier to run.

## Scenario: add “Clear completed” to a task list

The owner asks for a button that clears completed tasks from the active
list. One agent handles the interface, another handles storage.

1. **Agents identify a product decision.** Should clearing permanently
   delete tasks or preserve them in history? Both satisfy the initial
   request. The storage agent records the question and waits. Independent
   interface work continues.
2. **The owner asks ChatGPT for an update.** In a new conversation, they
   ask, “What needs my judgment?” The app shows the recorded question, goal,
   alternatives, consequences, and recommendation. No notification is needed.
3. **The owner investigates and decides.** They ask what happens after an
   accidental clear, then choose history so users can retrieve earlier work.
   Their assistant proposes explicit criteria. The owner adopts them.
4. **The agreement directs implementation.** Dap records the choice, reason,
   and revised criteria. The agents read that agreement and resume eligible
   work. The owner does not relay the answer.
5. **The owner reviews the result.** ChatGPT presents the exact change,
   evidence, and effect on the agreed behavior. The owner can investigate,
   request changes, or confirm an authorized merge. Dap records the outcome.

The same owner can retrieve and answer the existing question through Slack
or Claude. Slack alerts are optional.

## What the first version includes

Four MCP Apps views carry the process: **Needs you**, **Work**, **Decision**,
and **Change**. The required functionality is:

- **Recover context:** a short versioned product brief, accepted criteria,
  and changes since the person's last explicit review. Decision views link
  evidence, assumptions, alternatives, and consequences to that context.
- **Coordinate work:** two coding agents with separate saved workspaces,
  visible assignments, blockers, progress, and a shared spending limit.
  Decisions survive closed conversations and agent replacement.
- **Record accountable choices:** authenticated people adopt criteria and
  record decisions under their authority. Agent analysis, human judgment,
  and permission to perform an operation remain distinct.
- **Review and merge:** show the exact candidate, applicable checks and
  reviews, and actual publication result. Old cards cannot approve a newer
  version or repeat an unresolved operation.

The first complete cycle runs in separate ChatGPT conversations, with the
same records and core views tested in Claude. Routine choices remain with
agents within agreed criteria. People decide product trade-offs, conflicting
goals, and exceptions to authority. A passing check cannot choose between
two valid product directions.

## Adoption and proof

Start with one repo, one real task, and a bounded free allowance for the
complete cycle. The owner explicitly chooses paid continuation for hosted
coordination, agents, and saved workspaces. Colleagues join through links to
specific work in their own AI apps.

Compare the experience with existing Slack and GitHub integrations. Can the
owner explain the trade-off, spot a conflict with an earlier decision even
when checks pass, and resume work without copying context? Those results,
along with interruption recovery and coordination effort, establish value.

This is proposed functionality. Current dap supplies native work records,
questions, reviews, MCP operations, and Git publication. Host connections,
MCP Apps views, decision context, and hosted execution still need work.
Room members read the whole record. The first version has one source
destination and a fixed process, without two-way GitHub state synchronization.
The [unified forge](2026-10-15-unified-forge-design.md),
[hosted teams](2026-10-15-hosted-agent-teams-design.md), and
[roadmap](../docs/roadmap.md) hold the platform detail.

Comparison sources, checked 16 October 2026:
[GitHub MCP tools](https://github.com/github/github-mcp-server),
[Copilot's collaborative Slack sessions](https://docs.github.com/en/copilot/how-tos/copilot-integrations/integrate-cloud-agent-with-slack),
and [Slack's MCP Apps support](https://docs.slack.dev/ai/slackbot-mcp-client/returning-rich-responses/).
