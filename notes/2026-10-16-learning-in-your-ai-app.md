# Design proposal: shared learning within your existing AI app

We propose a hosted dap service for a continuing learning project inside
ChatGPT or Claude. A learner practises with their own agent and can invite
a tutor or peer to review selected work. MCP Apps supplies the plan,
submission, and feedback views inside each person's AI app.

## What dap adds to the learner's assistant

ChatGPT or Claude can already explain a topic, make a plan, and help someone
practise. Learning and coaching products already offer plans, recordings,
and feedback. Those features establish the baseline.

Dap adds a **shared working process across separate conversations**: the
agreed goal and plan, selected submissions, who owes feedback, and what
happens next. A tutor joins that work through their own assistant, without
joining the learner's private chat. Both return to the same project later.

The learner's agent helps with private practice and outside tasks such as
scheduling. Dap runs the shared process and any authorized background work.
The experience to prove is a useful learning relationship conducted through
people's existing assistants, with less coordination and no separate portal
to remember to visit.

## Scenario: prepare a five-minute presentation

A learner asks their assistant for help delivering a presentation in four
weeks. They can begin without a tutor.

1. **Agree a plan.** The assistant creates a project with a baseline attempt,
   short practice sessions, and a checkpoint. The learner accepts the plan
   in the app view.
2. **Practise privately.** The learner rehearses with their assistant. They
   choose a short recording and a question to submit, then preview exactly
   what will be shared.
3. **Invite useful feedback.** A tutor or peer receives a project link. In
   their own AI app or browser, they see the selected recording, relevant
   goal, and review request. They comment on a specific moment in the clip.
4. **Continue from the feedback.** In a new conversation, the learner asks,
   “What should I practise next?” The assistant retrieves the agreed plan
   and feedback, proposes a revision, and helps with another attempt. The
   learner adopts the change. No one copies a transcript between chats.

A tutor can also start the project after a lesson with an existing client:
“Here is our practice plan. Join with this link, or have your agent guide you.”

## What the first version includes

Four MCP Apps views carry the cycle: **Today**, **Plan**, **Submit**, and
**Feedback**. The required functionality is:

- **Start and resume:** create a project from a goal or lesson notes and
  recover it from a new conversation. Connection and invitation flows keep
  the intended project selected.
- **Share deliberately:** store and play a selected audio or video attempt,
  attach feedback to its exact version and time range, and show who can
  read it. Private rehearsal stays outside the shared record.
- **Invite a reviewer:** give another person enough context to contribute
  from their own conversation. They can join without a builder subscription.
- **Adapt the process:** support solo practice and a tutor-reviewed
  checkpoint, with different schedules and review requirements per learner.
  A changed plan preserves earlier submissions and assessments.
- **Continue between visits:** an optional hosted agent tracks missing work
  and prepares follow-up under a visible budget. Its owner can pause or stop
  it. A recording or agent summary does not establish mastery.

Use existing voice and call services. The first version needs a tested
upload and playback path on its chosen host, rather than a conferencing
stack or specialist assessment engine.

## Adoption and proof

Evaluation includes one complete practice and feedback cycle, without a
card. A learner starts alone, or a tutor tries the service with one existing
client. Storage, retention, and agent limits are stated before work begins.
The owner explicitly chooses paid continuation after finding it useful.
Human review, if sold, has its own price.

Compare this cycle with the learner using their assistant and a plain plan.
Do they return to practise, receive useful feedback, and improve on an
unassisted attempt? Can the reviewer contribute without reconstructing the
project? Repeat with a different supported process for a second learner.
Those results test the value of dap's coordination and customization.

This is proposed functionality. It still needs a learning definition,
MCP Apps views, media storage, invitations, and hosted execution. Every room
member can read its whole record, so sharing only selected work requires a
separate review room. Host capabilities, distribution, and permitted payment
flows need validation. The [application design](2026-10-15-self-contained-applications.md),
[hosted teams design](2026-10-15-hosted-agent-teams-design.md),
[roadmap](../docs/roadmap.md), and
[ChatGPT plugin rules](https://developers.openai.com/plugins/plugin-guidelines)
hold the relevant constraints.

Existing product examples, consulted 16 October 2026:
[Bobbin's assistant connections](https://withbobbin.com/releases),
[CoachAccountable's agent API](https://blog.coachaccountable.com/2026/08/coachaccountable-plays-well-with-ai-agents-thanks-to-the-api/),
and [GlideOS's bring-your-own-agent model](https://www.glideapps.com/byoa).
