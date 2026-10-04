# Experience and developer-adoption commissioning ledger

Dated 2026-10-03, following planning request
`2262034df901fca771f57e065f275e7cca00fcfc`.

The [frozen map](006-2026-10-03-experience-and-developer-adoption.md)
was independently approved in `a259c26d67b1f25bec2e1e06c5aeb3906134f4eb`,
ratified in `bf77c8cd526e4e2fbf72e8fa0368467cf74ea55f`.
Commissioning scope was adopted in
`cf11641005625a5f5d7231aefe2c461ffe05c2c4`, ratified in
`711f7826e6213818501bcebeab32f61eafbf6514`.
The exact map remains 24,013 bytes, SHA256
`7bdca0fd19a8c26613c9e9ea427c6cea1c3296c7fa429ff3ff1561135e03a381`,
artifact `5b32100a`, workroom attachment commit `109501e9`.
This companion records commissioning and review clarifications without
changing those approved bytes.

## Effective builder requests

All seven requests were independently inspected after filing: each is
effective, open, addressed to builder, and targets Artroom main. Their full
text and conditions match the prepared handoffs. This is queued work,
not accepted design decisions, source implementation or delivery.

| Key | Full request hash | Deliverable and dependency |
|---|---|---|
| N1 | `53016b8e7ebc4ee50322fc85ce5e9f7a9d4d0dfa` | Design the bounded proposal diff/interdiff/files/commit read and reader authority; later implementing lanes support C5/C6 real cold review. Integrate saved map/ledger/index as reviewed source evidence. |
| N2 | `9c43c17327cc26c2e5e54cd27fea197d26e803a5` | Complete product D1 addressed-work/conditions/commitment/result/acceptance lifecycle, including negotiation, handover, non-landing results and races; separately review any new primitive. |
| N3 | `f3299ab4b2bf553f2a221a353a7cb75f04cbd5c6` | Specify the separate public-package starter, registry/deployment availability and focused developer loop; N5 installation, public-client release, N1 when needed. |
| N4 | `5fee04f47e18a42024bbf642572045255b89c0a5` | Specify contextual guidance for unfamiliar app acts; reuse stage 5/MCP core, current authority/state/error reads and the short agent guide. |
| N5 | `f1af7cfdb6029863e2bd7e545ef526737f5648ea` | Design installation/checker deployment/evolution seams; coordinate job authority, stage-4 dispatch and actual next application requirements. |
| N6 | `db2fd1468ed09aecd51bbec3a89a45cb373b91a2` | Deliver the complete approved manual, with all section-4 inventory and additional troubleshooting/agent/skill material; start beside Jam after builder-positive readiness. |
| N7 | `64e9d131567e647c8c33394aa7cd817274eea175` | Choose and design absent-person attention delivery, consent/revocation/queued-alert disclosure/failure; reuse C1/C3/C4/C5, not agent trigger/wake. |

N1/N2/N3/N4/N5/N7 owe design/specification source artifacts and exact
implementing-lane scopes. Planner commissions their implementation
separately only after independent exact design review and adoption.
Their eventual source behavior remains owed; a design report must not be
called implementation delivery. N6 implements an already approved
documentation plan. It does not adopt the still-open docs-host choice.

## Complete scenario-to-owner map

C1–C6 are the six existing implementation requests in
[005's index](README.md#connected-browser-coding-stories); they remain open.
These cross-links reuse their owned outcomes and add evidence to the same
journey, without silently enlarging previously promised stage-5 or MCP
closure conditions.

| Scenario | Owned tasks | Bounded outcome and measure |
|---|---|---|
| E1 First useful result | C1–C6, N1, N6; bootstrap/lane J | Cold person completes a real useful browser change; measure setup/help/time and distinguish landed from published-through. |
| E2 Leave and return | C1–C6, N7 | A closes; same-member B observes/steers; acknowledged state survives and unknown effects reconcile; measure attention response latency. |
| E3 Midway cold review | C5/C6, N1 | Real immutable artifacts and current/carried/stale evidence justify a decision without transcript; retain anchored question across revision. |
| E4 Accountable non-landing work | N2; actual delivered development practice | Request, negotiated conditions, commitment, two-agent handover, cancellation/report and requester judgment remain attributable; both race orders. |
| E5 Incremental adoption and exit | C4/C6, N1, N6 | One repository/task/reviewer; independently fetch ordinary Git and bounded verified published record; no mirror/synchronization claim. |
| DX D1 Starter | N3, N5, N1 where needed | Cold outsider uses pinned public packages and a deployed Room with no source import or platform patch; setup/manual/help metrics. |
| DX D2 Discovery | stage 5/MCP core, N4/N6 | Cold agent discovers unfamiliar meaning/target, handles refusal/wait and acts appropriately; turns/tokens/help. |
| DX D3 Client mechanics | stage 5/MCP core, C3/C5, N3 | Shared exact preparation/receipt/replay/settlement; explicit durable storage adapters; timeout never means absent. |
| DX D4 Developer loop | N3 and test economy | Focused disposable two-actor Room and public conformance support, explicit local/hosted fidelity, one justified external boundary smoke. |
| DX D5 Install/evolve | N5/N3/N6, stage 5, checker authority and stage 4 | Correct participant/admin/operator ownership, exact activation/regrant, live held-thread exit and retained old meaning. |

## Five explicit independent-review details

1. **Live work survives updates.** N5 includes an open/held thread and its
   valid release/exit route through activation, with historical meaning
   retained. Package-release handling alone is insufficient. Unsupported
   compatibility requires a named decision; no silent stranding.
2. **Public test support.** N3 chooses a public fixture/API, hosted disposable
   Room or app-owned public-interface scenarios. Private workerd tests import
   `cloudflare:test` and Room internals; they are not a public test SDK.
   Identify exports/runtime/provisioning/release owners and the actual
   demonstrated checker route.
3. **Shared semantics and adapter owners.** The existing client has
   `PreparedAct`, `onPrepared` and exact replay; it is not a delivered
   universal durable outbox. C3 owns trusted Agent SQLite, C5 browser
   persistence, and N3 its example adapter. Persist exact prepared intent
   before dispatch and reuse client signing/settlement; do not reconstruct
   uncertain intent.
4. **Full work conversation.** N2 includes counter-offers/negotiated
   conditions, explicit representation of unsupported transitions, two-agent
   handover preserving conditions/context and cancellation racing with
   report/requester acceptance.
5. **Full documentation beyond the inventory.** N6 preserves all 67 unique
   section-4 pages without making 67 a cap; section-5 troubleshooting/FAQ,
   every harness/agent/skill material and all eight section-8 acceptance
   conditions remain owed. C6's journey pages cannot replace the manual.

N7 additionally decides disclosure of queued alerts after revocation.
An external provider's already accepted delivery cannot be assumed recalled.
Notifications confer no control authority and authorize no live messages
through this planning task.

## Open choices and owners

| Choice | Owner and decision path |
|---|---|
| Proposal committed-object read authority, immutable pins and bounds | N1 builder design; independent review/adoption; C1 private raw access is retained. |
| Complete work lifecycle and any missing primitive | N2 builder design, requester/performer/admin authority explicit; independently adopted amendment only if needed. |
| Public starter package/release availability and supported outsider fixtures | N3 builder specification with operator/release owners; actual registry/export/deployment evidence. |
| Guidance runtime versus documentation and any missing authoritative read | N4 builder specification; hints stay advisory; contract change separately reviewed. |
| Actual checker route and a later cross-account trigger | N5 builder design with `f12cef6b` and `48c021ea`; same-account initial path, external transport only against a real need. |
| Docs hosting and cold-reader testers | Hugh, as retained in approved docs plan; Markdown can proceed before host choice. |
| Absent attention channel, consent and queued-revocation disclosure | N7 builder design and independent product/authority review before implementation. |
| First Jam task and positive self-hosting readiness | Builder under `b4ef9b7a`; no complete-backlog or frozen-vocabulary gate. |

Registry evidence `f7d25b69`: at 2026-10-04 00:54 UTC (October 3 locally),
`npm view @generalbusiness/artroom-client version --json` and the corresponding
contract query returned E404 from npmjs under the current context. This does
not prove private releases absent; it does mean public outsider installation
has not been demonstrated.

The 10× test-overhead work remains highest implementation priority.
All new requests retain meaningful focused verification, evolving acts and
the complete backlog. No application code, build, deployment, live
notification or runtime test was performed in commissioning this map.
