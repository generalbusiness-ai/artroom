---
title: Software and the Cauldron
date: 2026-10-14
description: A new Durable Action Platform: dap
image: cauldron.jpg
author: Hugh Pyle
status: published
---
Software development with git, especially in a large organization, can be messy.  And the mess is often to be found in the rules and guardrails.

Some rules are so badly specified that they need _people_ to enforce them!

Code review is difficult because the rules are often unwritten: judgement-calls by experienced architects and engineers.

The rules that can be written down, are; and there's a huge variety of those.  They include hooks (`.git/hooks/`, `.pre-commit-config.yaml`), pre-merge checks and branch protection, Strict Mode, assignments (`CODEOWNERS`), agent guidance and skills (`.github/copilot-instructions.md`, `.cursorrules`, `.coderabbit.yaml` and so on), and of course CI (GitHub checks actions, Jenkins, and whatever else you're running).

Issues and PRs aren't even part of the Git repository itself.  But they have rules, too: who can create and close an issue, what states it can be in, who can approve or merge a change.

What are the rules for? They set constraints for coordination.  If you're a solo developer, they can sometimes be useful to prevent accidents. But with teams -- and swarms -- they become essential.  Rules for what can be done, and who can do it, and when.

So as we accelerate development using agents, the bottleneck is not just merge-conflict resolution, code-review, or issue-tracking.  We could really use a better way to build **rules**.

This is [dap](https://dap.generalbusiness.ai/): a "durable action platform" for people and agents.  It runs on Cloudflare Workers, Durable Objects and Artifacts.  Its precursors include some things I've been experimenting with recently: [gitseq](https://github.com/generalbusiness-ai/gitseq), [atseq](https://github.com/generalbusiness-ai/atseq) and [noseq](https://github.com/generalbusiness-ai/noseq).  The examples below are applications built on dap.

---

## Counting

Let's start with rules for a simple-looking coordination task.  Counting.

You may have seen [this video](https://www.youtube.com/watch?v=MXEInc6Zy7Q) - it's funny, in a train-wreck kind of way.

Having agents count in a sequence is easy if you have infrastructure that helps.  Inspired by [Thomas Karatzas](https://x.com/karatzas_thomas/status/2108276198564638886) I built a small `dap` application, for agents over MCP, where they need to count aloud.

The rules are simple: "commit", then speak, then "fulfill" increments the number.  Competing claims are resolved by who committed first, and losers are refused with a descriptive reason.  A claim that's never fulfilled expires after a while.  And of course the application is durable; the count is never lost.

Here's a quick demo video.  Or [try it online](https://dap.generalbusiness.ai/counter/).

[![Watch the video](dap.png)](https://youtu.be/DABorb-5Pfg)

---

## The Baby Cauldron

An old story goes [something like this](https://sites.pitt.edu/~dash/type1592b.html):

> Nasreddin Hodja borrowed a large cauldron from his neighbor, then returned it the next day.
> 
> "What is this?" asked his neighbor. "There is a small pot inside my cauldron!"
> "Oh," responded the Hodja, "while it was with me, your cauldron gave birth to a little one. You should keep it. It wouldn't be right to separate a child from its mother at such a young age."
> 
> The neighbor, thinking that the Hodja had gone quite mad, didn't argue.
> 
> Some time later the Hodja asked to borrow the cauldron again. "Why not?" thought the neighbor to himself. "Perhaps there will be another little pot inside when he returns it."
> But this time the Hodja didn't come back. (Some say he was short of funds and sold it at the market). After several days, the neighbor went and asked for the cauldron. "My dear friend," replied the Hodja. "Bad news, I'm afraid. Your cauldron died!"
> 
> "What are you saying?" shouted the neighbor. "A cauldron does not live, and it cannot die. Give it back!"
> 
> "Hold on now!" answered the Hodja. "This cauldron just recently gave birth to a baby pot, a child still in your possession. If a cauldron can give birth, then it also can die."
> 
> And the neighbor never saw his cauldron again.

Let's assume that Nasreddin's neighbor starts a small lending-library, and wants an app to track the things he's lending.  If the library's rules can defeat or expose Nasreddin Hodja's wiles, they may be fit for purpose.

Here's a small application.  The rules don't exactly say "no baby cauldrons", but they do prevent borrowing the same thing twice, and returning something that wasn't lent -- although the staff can of course donate an item, and declare an item lost.

The other thing the app needs is a public view of the library. It's built on git, and Artifacts can do that!  Each thing in the library has a Markdown page in the repository, and the application keeps it up-to-date, and dap publishes to the Web. So everyone consistently sees the state of the library.

Video demo below.  Or [try it out yourself](https://dap.generalbusiness.ai/library/).

[![Watch the video](dap.png)](https://youtu.be/ZWrZlY3lZM0)

---

## Software Development

So finally we come to the mess of Git-driven software development.

The repository can play multiple roles.  First of course, it can be the place where work is delivered and a product is built.  But beyond that, it can hold an application itself.

In `dap`, the application is defined using a few very simple things:
* The acts that can be performed,
* The rules that determine whether an act is acceptable,
* The effects when an act has been accepted.

This is the "event-sourcing" application model, with a signed and auditable event-log, and durable effects in an "actor".  Each actor defines a scope of behavior.  Actors communicate by sending messages to each other.

We start with a simple set of rules that govern issues and changes, so that teams of users can coordinate around the work.  Those rules are easy to extend into the other types of constraints that larger teams need, that are usually implemented with hooks and checks and issue templates and hard-coded logic.

Now it does something special.  The event log and the rules and the definition of their effects are designed to be held _in the repository_.  This is where git becomes an application substrate; where Durable Objects and Artifacts become a platform for real applications that implement real business rules.

And we also get strong traceability, including the ability to rewind and replay and verify offline.  Find exactly which person or agent did what, and why; issues and changes are all tracked alongside the work product.

This architecture should scale to millions of actors, including coordination between lanes that compose into significant things.  The framework is also small enough that agents can build simple applications on it with very little effort.  I've [started a list](https://github.com/generalbusiness-ai/dap/blob/main/docs/use-cases.md) of some of the applications that I think we'll need to build.

Here's the workroom in action.  It shows multiple agents claiming issues, proposing fixes, colliding and adjusting, and coordinating to land their changes.  Online, you can [try it yourself](https://dap.generalbusiness.ai/room/).

[![Watch the video](dap.png)](https://youtu.be/exCY3pkoDDk)


Welcome to [dap](https://dap.generalbusiness.ai/).
