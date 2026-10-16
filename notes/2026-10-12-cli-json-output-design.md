# JSON output for the dap command line

Builder revision 3, for independent design review. Request `f319c428`,
promise `a6d5ee53`, under `92d6dddb` and `c1cacd1a`. This replaces the
retained planner draft at `65609bac` and builder revision 2 at `58889d54`,
addressing checker review `4a15bc25` against current local Main
`0548b726d0a3e17ec171e71d93365d5311f61ccf`.

Every finite command produces one typed execution result. Text and JSON
render that same execution. Neither renderer signs, sends, retries, reads
mutable state or changes custody. The JSON result uses native contract
structures and full identifiers. It never wraps prose as structured data.

This note authorizes no implementation, publication, live act or deployment.
Review must explicitly decide the proposed shared read policy in section 7
and the MCP exception in section 2 before implementation starts. Those
choices are separate from selecting a renderer.

## 1. Parse the flag without changing token ownership

`--json` takes no value. At an option position it selects JSON before,
between or after command words. Repetition has the same effect as one
occurrence. There is no environment default, `--format`, `--output`,
`--pretty` or JSON-lines mode in version 1.

One command-aware scan owns each token. A value-taking option consumes its
next token exactly as today, even when that token is `--json`:

| Invocation | Result |
| --- | --- |
| `dap issue open --title --json` | Text mode, title `--json` |
| `dap --json issue open --title --json` | JSON mode, same title |
| `dap --json` | JSON usage, exit 2 |
| `dap frob --json` | JSON usage, exit 2, empty resolved command |
| `dap act --json` | JSON usage, exit 2 |

Unknown options keep today's value consumption and usage behavior. A raw
argument pre-filter is incorrect. The global switch is removed from the
command-specific flag map only after ownership is known. For example,
`issue close --json` must not trigger today's “only issue open takes flags”
check for a flag owned by the global parser.

MCP's `--generic` and `--generic=add` are switches. Its `--tools`, `--http`,
`--scope` and `--membership` consume values. Those values retain ownership.
An invitation link or arbitrary positional word never becomes a public
command label, diagnostic argument list or echoed usage fragment.

Mode selection precedes `configDir()`, filesystem access and command
startup. Early configuration failures therefore cannot bypass the public
JSON error boundary. Existing exported `parse` and `command(ctx, argv)`
interfaces remain compatible adapters for current clients, including Room
startup. The Node entry can call a new typed entry point. Internal workflows
share typed progress; they never parse a text adapter's output.

## 2. Output and the long-lived MCP exception

In JSON mode, each finite invocation writes one compact UTF-8 document and
one newline to stdout, for exits 0, 1 and 2. The finite command writes no
progress or diagnostics to stderr. Its process exit equals the envelope's
`exit`. Unexpected errors are caught before the runtime prints a raw stack.

Git is a trusted child boundary. Inherited stdout and stderr, including
`git --version` preflight and clone, go to parent stderr in JSON mode.
Captured object bytes stay private producer input. Existing discarded
capture diagnostics remain discarded. No child's output becomes part of
the document. Ambient Git configuration, helpers, redirects and child stderr
retain their existing trust boundary; they are not a confidentiality promise.

Without option-position `--json`, `dap mcp` keeps its current stdio or
loopback HTTP protocol. It may create a key, persist a standalone root and
write existing startup or bearer-handoff diagnostics to stderr. Stdio
stdout belongs exclusively to MCP framing. Normal shutdown with no outcome
lines writes no extra document or newline.

With option-position `--json`, resolved command `mcp` returns a finite
usage/2 envelope before configuration reads, key creation, root writes,
listener binding or protocol startup. A consumed option value `--json`
remains data. This design covers every finite invocation. It does not wrap
a running MCP server in a finite result.

## 3. One envelope retains evidence through every phase

A successful result has this form; the empty result below is illustrative,
not a complete command-specific schema fixture:

```json
{"v":1,"command":["issue","open"],"phase":"complete","status":"done","exit":0,"result":{}}
```

Required keys, in output order, are `v`, `command`, `phase`, `status` and
`exit`. Optional public keys follow: `result`, `error`, `recorded`,
`observations`, `custody`, `waited`, `next`. Native values keep their native
fields and full hashes. Key order aids reading; consumers cannot depend on
it and must ignore unknown optional keys.

`command` contains only resolved allowlisted command words. Install's
plan/planned choices are modes, not subcommands. `create`, `found` and
`claim` resolve to `create`; an optional allowlisted alias names the latter
two. Invalid commands use an empty array. No supplied secret or path can
become a command label.

Phases are `parse`, `preflight`, `prepare`, `submit`, `observe`, `local`,
`read`, `verify`, `child` and `complete`. A phase names where execution
stopped. A submission judgment and a later publication observation remain
separate evidence.

| Status | Exit | Meaning |
| --- | --- | --- |
| `done` | 0 | The requested command or explicitly selected read completed; coverage remains explicit. |
| `partial` | 1 | A workflow stopped after earlier confirmed work; its unfinished step and cause remain explicit. |
| `refused` | 1 | A known native judgment, later refusal or local custody refusal, with its origin identified. |
| `unavailable` | 1 | Native unavailable answer, including `rate-limited`. |
| `mismatch` | 1 | Native idempotency mismatch. |
| `unknown` | 1 | Dispatch or a later result remains unobserved. Known acceptance is retained. |
| `not-found` | 1 | An actual negative read or search, not an inferred absence. |
| `unreadable` | 1 | Permission, availability, incarnation or response admission prevented a read. |
| `unsupported` | 1 | A known unsupported definition, capability or workflow. |
| `no-answer` | 1 | A received reply could not be read as the expected native answer. |
| `incomplete` | 1 | A read stopped at the separately adopted allowance; collected data and coverage remain. |
| `inconsistent` | 1 | A completed verification returned its native report with a finding. |
| `usage` | 2 | The current argument or configuration precondition fails. |
| `error` | 1 | An unexpected local failure, with a fixed safe public diagnostic. |

Existing command exits remain authoritative. Missing configured repository
is usage/2 wherever today's producer uses that outcome, including invite,
issues, verify-all, remote, clone and issue workflows. No schema mapping
changes that result to not-found/1. The proposed shared read stops in
section 7 are explicit behavior changes in both renderers.

`result` may appear with every status when the producer knows public data
or progress. Unsupported clone can retain `git: {ran:false, exit:null}`.
Inconsistent verification retains its native `Report`. A refused merge
retains its accepted merge fact and later observation. A session, credential,
file, cleanup or Git failure cannot erase earlier acceptance.

`recorded` lists known accepted receipts or facts with public role labels on
non-done outcomes. Done workflows keep those facts in `result` only.
The execution records acceptance before the next fallible step. An exact
retained signed original without a receipt is custody, not a recorded fact.
`custody` states retained/verified, unresolved or unavailable and public
intent/operation identity where known. It exposes no private filename or
secret-bearing original. `waited` retains actual polls, scans, next position
and stop reason when the producer knows them.

`observations` records independently read ScopeRefs and heads. A folded
item observation has its actual item ID and revision. Only an actually read
sealed fact receives a `FactRef`; a revision is never invented as a sequence.
No aggregate claims a snapshot across independent reads.

`next` contains only allowlisted structured inspect, check or explicit
continue actions. Unknown, unavailable, transport failure and persistence
failure do not grant a fresh mutation. Exact original recovery remains
separate from a new request.

### Errors identify their origin

| `error.kind` | Public payload |
| --- | --- |
| `intent` | `answer`: unchanged nonaccepted native `Answer`, with known target. A refusal keeps actual `judgedAt` and optional `name`. |
| `founding` | `answer`: unchanged nonaccepted `Founded`, with known target. No invented judged head. |
| `observed` | Actual later refusal/abort and its sealed fact or folded item/read evidence. |
| `read` | Actual refused native `Read`, or a separate closed response-admission code. |
| `transport` | Closed safe code and whether mutation dispatch may have begun. |
| `local` | Closed safe code for known capability, custody or configuration failure. |
| `usage` | Closed code, bounded safe message and usage text; no raw argv or private paths. |
| `unexpected` | Fixed `unexpected-error` code and fixed public message. |

A host mint refusal is not `Answer.refused`. `Founded.refused` has no
`judgedAt`. Lost transport is not a manufactured native refusal. Native
answer reasons remain under `error.answer.reason`; a guard name remains
under `error.answer.name`. Local categories use closed `error.code` values.
The implementation must enumerate actual producer categories before schema
review, rather than copying raw diagnostic text.

## 4. Native types and confidentiality

`ScopeRef`, `FactRef`, `Head`, `MemberRef`, `Answer`, `Founded`, `Receipt`,
`Entry`, `Summary` and `Report` retain contract shapes. Known full references
remain full references. A configuration holding only a scope ID does not
justify inventing its incarnation. Every projected read value names its
actual read head. No identifier or hash is shortened.

The public result is constructed before serialization. Closed public error
factories cannot accept arbitrary `Error.message`, stack, cause, caught
transport objects or argv. Unknown exceptions use a fixed diagnostic.
Known filesystem/configuration failures use allowlisted messages without
private path interpolation. A renderer without Context is insufficient if
the producer has already copied a private error string.

A separate private carrier may preserve existing human diagnostics for the
text adapter. The JSON serializer cannot accept or stringify that carrier.
Its input contains no config-directory path, environment, key secret,
session bytes, token plaintext, provider credential, private signed founding
intent, local `--file`/`--value` bytes or stack trace. Counts and native
digests may remain public.

Two deliberate disclosure boundaries are separate:

- A verified `invite` handoff emits `confidential.link`, once, because that
  link is the requested deliverable. It appears nowhere else in the public
  result or diagnostics.
- `show` emits the authorized native Entry. `log` emits selected native
  input summaries. JSON does not widen read authority or sanitize retained
  history. Older enrollment entries can retain supplied invitation secrets.
  There is no blanket native-history secrecy claim.

Private progress must survive later exceptions without rereading mutable
state to reconstruct what happened. This requirement applies equally to
local save, session creation, credential retrieval and child failure.

## 5. Complete finite command catalog

The following payloads are typed schema descriptions, not literal JSON.
Each command also uses section 3's evidence, error and custody variants.
Statuses describe actual producer outcomes; configuration usage branches
keep exit 2. Refused reads use their actual native reason, and unavailable
resources are never inferred absent.

| Command or mode | Public result and required evidence |
| --- | --- |
| `install <base-url>` | Mode `direct`, service, actual definition, register ScopeRef, accepted `Founded`, operator public KeyId and kept state. Selected cohorts use their exact retained plan even without `--plan`. Capture acceptance before config save or recovery acknowledgement. |
| `install --plan` | Mode `plan`, service, actual definition, register ID, host, namespace, notAfter, optional selected cohort and public custody identity. Never emit the signed founding intent. Exact existing selected plan is successful observation; a conflicting attempted plan is a local refusal. |
| `install --planned` | Mode `planned`, actual register/definition, accepted `Founded`, known configured-service acknowledgement and custody. No retained plan remains usage/2. Expired, missing or conflicting originals retain their actual local refusal and do not authorize replacement founding. |
| `create <name>`; `found`, `claim` aliases | Canonical create label, optional allowlisted alias, name, handle, public key/member standing, Repository refs, actual definition pins, founding receipt and each independently confirmed scope/head. `--again` resumes the original. Preserve accepted creation when confirmation or local save fails. Keep found's existing human deprecation line. |
| `invite <@member> --role` | Member, role, invitation fact, expiry, actual membership pin and verified `confidential.link`. The legacy direct path and unsupported `--acts` keep their current behavior. No repository remains usage/2. |
| `invite --keep` | Mode `new`, operation, kind, handle, actual issuance state and known accepted steps. State is `prepared`, `unknown`, `refused` or `verified`; it is an observation, not a substitute Answer. Verified is done/0 and may emit the confidential link. An unresolved issuance is unknown/1 with original custody. |
| `invite --check` | Mode `check`, same public operation/state/evidence. Reads the retained original; does not submit or restore a missing public pointer. No retained invitation remains usage/2. |
| `invite --continue` | Mode `continue`, same public operation/state/evidence. Explicitly resumes the exact retained original; no replacement signature or invocation from a renderer. Preserve acceptance through later verification, save or cleanup failures. |
| `join <person link>` | Kind `person`, handle, public key, MemberRef, Repository/inbox refs, actual accepted join fact/receipt and confirmation observations. Resume the exact retained signed original; do not overwrite pending agent enrollment. Link/secret/signature bytes stay private. |
| `join <tagged agent-key link>` | Kind `agent-key`, mode `continue`, actual public key/seat observations and known accepted steps. No person substitution, key transplant or assumption that retained private bytes prove acceptance. Unavailable/unverified original is a local custody outcome. |
| `join <tagged agent-key link> --check` | Mode `check`, observation/custody only. The explicit tagged invitation is required. No new key or mutation. Preserve the existing invalid-link and missing-original exits. |
| `acts [<scope>]` | ScopeRef, actual scope summary head, definition pin, public caller key/standing, separately read membership ScopeRef/head, catalog map by native act kind and hidden count. Keep step/on/grant, complete native field declarations and nonempty also/presents. Omit programs, rules, guards, effects, sends, attention, settles, items, receives and timed. No availability flag; guards still decide at submission. |
| `act <kind> --on <scope>` | Target ScopeRef, native kind, public intent digest and unchanged Answer. Accepted is done with Receipt. Refused/unavailable/mismatch retain their native shapes. Unknown kind or invalid field input keeps its current usage branch. Never emit detached local value bytes. |
| `log <scope> [--limit n]` | Selected entry summaries, actual scope/heads, limit, collection coverage and termination. Preserve every native Input variant (section 6). A bound prefix is not the complete tail. |
| `show <scope>:<seq>` | Actual ScopeRef, sequence, full computed hash and whole native Entry. It accepts an entry position, not a retained definition digest. Keep detached data as native digest references. |
| `verify <scope>` | Whole native Report, actual scope, consistent flag and safe public reason when known. A finding is inconsistent/1 with result. A stopped collection cannot invent a complete Report. |
| `verify --all` | Repository, discovery coverage and separate per-scope Report/not-read/cleanup records with actual scope refs and heads. No cross-scope snapshot. Keep the first actual finding separately from incomplete discovery/replay. |
| `remote` | Destination ScopeRef/head, recorded host/namespace/name and known remote URL. A service-host placeholder stays explicitly unknown rather than a fabricated URL. |
| `clone [<directory>] [--hours n]` | Accepted read-token fact, operation, actual native mint outcome fact, waiter progress, known remote URL/expiry and child ran/exit/directory. Mint Input.result is confirmed/refused/unknown, not an invented native “minted”. Token plaintext stays private. No-Git preflight is unsupported/1 before signing. Preserve acceptance through session, credential, config-save or child failure. Token retrieval is once; no failure authorizes automatic remint. |
| `edit <path> --file` | Accepted change opening, proposed file fact/version/path/count, optional actual issue link and nested merge result. No local file bytes. An unconfirmed later step is partial/1 with earlier recorded facts and typed cause. |
| `propose <branch>` | Accepted change opening, actual base/tip, proposal fact/version/file count and optional nested merge result. Retain actual capture categories such as no-changed-files and too-many-files as closed local codes; do not rename them to paths or copy arbitrary Git errors. |
| `merge <change> [--closes <issue>]` | Lane ScopeRef, version, accepted merge fact, publication/reservation observation, and commit/tree/page only when known. Committed reservation is not publication. Later refusal/abort is refused/1 of observed origin, with accepted fact retained. Accepted but unobserved is unknown/1, not a retry instruction. |
| `issue open --title` | Actual issue number if known, lane ScopeRef/title, accepted directory opening and independently confirmed lane head. Preserve opening acceptance if lane creation/confirmation cannot be read. |
| `issue comment`, `issue assign`, `issue close` | Friendly command label, separately selected native kind and unchanged Answer. Close selects actual close-own or close-any and uses current completed reason. No invented guard head or reason. |
| `issues` | Directory ScopeRef/head, then each actual lane ScopeRef/head, nullable number, title/state, closeReason, opener and full assignees array. Coverage counts omitted index rows, absent intent rows and stops. Counts describe returned rows and describe the room only when complete. |

A directory index can remain stale when a merge closes an issue. It supplies
order and lane lookup, not the lane's current state. `issuesOf` reads each
actual lane. A refused lane read retains prior valid rows as unreadable/1;
it does not declare that lane absent. Issue mutations and edit/merge linking
share this lookup and must retain its actual bounds and provenance.

The acts catalog is keyed by native act kind, with no repeated kind field.
A field keeps native bounds, required/default declarations and nested
record/list forms. Role filtering and rule grants follow the current
producer. A finished Counter can still list start; listing grants no act.
The historical C1 observation measured one profile's full act forms at
8,436 compact UTF-8 bytes and selected catalog fields at 2,705 bytes.
It is not a universal definition or envelope-size bound. A future full
catalog flag is deferred. Authorized definition reads supply native bytes;
`dap show` does not accept a definition digest.

## 6. Log inputs and truthful coverage

A log summary retains sequence, full hash, time, effect/send counts and a
discriminated summary of every native Input type:

| Input.type | Relevant native fields retained when present |
| --- | --- |
| `genesis` | kind, decision |
| `act` | signed intent kind and public actor |
| `delivery` | native message class/type, from and actual decision/clause when present |
| `diagnosis` | of, finding |
| `timed` | item, rule, due |
| `preparation` | capability, step and public actor |
| `outcome` | operation, attempt, owner, kind, result |
| `checkpoint` | through, state |

No variant invents an act kind, signer, decision or judged head. `show`
provides the whole Entry. `log` does not inline arbitrary signed fields or
private local bytes to reproduce a line summary.

Coverage distinguishes end reached, bound exhausted, refused read and
transport stop. It records pages, collected entries, admitted UTF-8 bytes,
actual observed heads and the last native cursor when present. `total` is
emitted only after complete collection and means entries actually collected.
An incomplete result instead says `collected`. A cursor without successful
read evidence supplies no invented head.

Current `log` reads up to 1,000 pages and checks no final next cursor at
exhaustion. It retains every collected Entry, then applies slice(-limit).
`--limit` bounds neither collection nor bytes and has no absolute maximum;
zero and negative values keep JavaScript slice behavior until an explicit
argument-policy change is adopted. A JSON renderer cannot label a bounded
prefix the last entries of the complete history.

Current room discovery uses a page allowance per discovered scope (default
1,000), not a global scope, byte, replay-dependency or output bound. A
complete single-scope Report does not imply complete room discovery or
cleanup. The typed result records those three phases separately.

## 7. Proposed shared read policy requires explicit adoption

The corrected design proposes one shared collector for both renderers.
This is separate implementation work coordinated with priority-one request
`e0292346` and existing bounded-query/session owners. It does not duplicate
or close that work. A JSON switch alone cannot enable a new producer policy.

Proposed per-invocation defaults are 256 distinct scopes, 4,096 read calls,
64 MiB of admitted UTF-8 response content, 8 MiB of public result content
and a 120-second absolute deadline. These are proposed client policy values,
not provider ceilings or performance measurements. Native per-response
bounds still apply. History pages, summaries, retained replay dependencies,
fallbacks, retries, internal lookups and result assembly share the remaining
allowance. No cache hit or nested workflow starts a new allowance.

Actual response admission must precede body materialization, using truthful
metadata or a bounded transport read. A transport lacking that capability
reports unsupported; it cannot claim a hard pre-materialization bound.
No native record or declaration is silently truncated. A result stops at
the previous complete unit when the next whole unit cannot fit. Result
bytes include actual UTF-8 serialization, envelope and continuation. These
limits claim no physical cancellation, draining or global process heap bound.

An allowance stop becomes incomplete/1 with valid data and explicit coverage.
A refused read is unreadable/1; a lost reply is unknown/1. A verifier emits
a Report only when the native verifier actually returned one. A stopped
replay is not an invented complete Report or an inconsistent history.

Continuation is a versioned public `readNext`, accepted explicitly by
`log`, `issues` and `verify --all` as `--read-next <value>`. It binds resolved
command/options, exact scope incarnations and observed heads, completed
coverage, pending scope order and each native cursor. It contains no
credential, session, key material or private path and grants no authority.
It is untrusted input, validated within a proposed 1-MiB encoded bound and
counted inside the result allowance.

Resume obtains fresh read authority and a new allowance, then checks the
bound heads. A changed head returns an explicit restart-required local code
and incomplete/1, never silent combination across heads. If a coherent token
cannot fit, retain valid coverage and say continuation unavailable. Do not
claim complete coverage or silently drop pending scopes.

A complete log tail is available only after collection reaches its bound
head. Incomplete prefixes are labelled collected prefixes. Verification
continuation distinguishes discovery, replay and cleanup. A discovery
cursor is no replay checkpoint. Resume must preserve a validated verifier
checkpoint or explicitly restart that scope's replay within its new
allowance. Native Reports keep their existing shape.

These allowance, continuation and incomplete-exit changes need explicit
design adoption in both renderers. They are the named exceptions to text
parity at previously misleading exhaustion or unbounded aggregate paths.
Ordinary completed text invocations keep existing bytes, streams and exits.
If review declines this policy, the design must choose another truthful
aggregate contract before those commands' JSON implementation, rather than
claim that a short document bounds the reads that produced it.

## 8. Schema and compatibility

Version 1 freezes only after the corrected design and implementation review.
Publish the checked-in schema under `packages/cli/schema/`. Its variants
discriminate command, mode, phase, status and evidence origin. The schema
must permit every reachable result/evidence combination, including result
on refused, unsupported, unknown and error. It never replaces native
validators or actual UTF-8 admission.

Within version 1, optional keys and commands may be added. Required key
removal/rename, type changes, changed status exits or a new closed status
require version 2. Consumers ignore unknown optional keys and never rely on
key order. Native structures follow the native contract and package version;
the envelope does not rename or privately version their fields.

Checker `4a15bc25` preferred inconsistent/1 with native result, confidential
link output, done facts in result and the schema in the CLI package. This
revision adopts those preferences. Full catalogs, environment defaults,
JSON-lines and follow mode remain deferred. The proposed shared read policy
and MCP exception remain explicit decisions requested from this review.

## 9. Meaningful verification plan

Builder implements and runs focused checks; checker reviews the exact head;
planner owns priorities and task acceptance. The following are planned
witnesses, not passing evidence from this document change.

| Invariant | Cheapest meaningful witness |
| --- | --- |
| One execution, two renderers, no repeated mutation or read | Render both from one existing command fixture's typed result; retain existing text/exit assertions. |
| Exactly one stdout document/newline for exits 0, 1 and 2 | Process-boundary harness including early config failure; verify exit equality and compact bytes. |
| Option-position JSON preserves consumed data | Parser/main cases for title --json, repeated switches, issue non-open and MCP value ownership. |
| Native evidence survives later failure | Strengthen existing acceptance-then-refusal, custody-save, session, credential and child-failure cases. Use reachable failures, not one fixture per status. |
| Native shapes and full identifiers remain intact | Exact equality of native Answer, Founded, Receipt, Report and Entry fields from existing fixtures. |
| Private failures cannot enter public serialization | Path/credential sentinels in early config and later filesystem/transport failures, plus explicit confidential-link and authorized-history cases. |
| Actual issue reads remain distinct from index state | One existing multi-lane listing with outdated index, different heads, nullable number, close reason and multiple assignees. |
| Catalog gives forms, not availability | Existing profile/Counter fixture: native field declarations, rule grants, hidden count, separate heads and finished start listing. |
| Every native log variant and stop remains truthful | Existing log witness extended with diagnosis/timed/preparation/outcome/checkpoint and exhausted-page next cursor. |
| Child stdout cannot corrupt the document | Git stand-in writes both streams; separately retain captured-byte behavior and preflight. |
| JSON MCP rejection starts nothing | main/parser effect sentinels for config, key, root, listener and protocol; unchanged no-JSON MCP path. |
| Aggregate allowances cover nested work and resume | Small injected shared limits, one real-limit check, changed-head and missing-authority continuation cases; no wall-clock sleeps. |
| Schema matches public producers | Validate actual result fixtures and meaningful invalid combinations; do not mirror implementation in a second serializer. |

Run the tests of changed source while implementing, and one gate at the
review candidate under `docs/testing.md`. No mutation sweep or repeated
whole suite. Completed text behavior stays covered by existing witnesses;
new shared read stops are explicit exceptions tested in both renderers.

## 10. Source reconciliation and delivery order

This revision changes one Markdown file. Source, tests, assets, dependency
and configuration bytes match Main `0548b726d`. No test or gate is repeated
for prose alone. Relevant current source boundaries are:

| Decision | Source |
| --- | --- |
| Token ownership, aliases and command modes | `packages/cli/src/line.ts`: parse, command, issue |
| Early config and MCP dispatch | `packages/cli/src/main.ts`: main; `config-dir.ts`: configDir |
| Ordinary/selected founding custody | `packages/cli/src/commands.ts`: install, planInstall, installPlanned, executePlannedInstall |
| Retained issuance/enrollment | `packages/cli/src/invitations.ts`: invitePerson, issueInvitation, enrolAgentKey; `commands.ts`: join |
| Log input and exhaustion | `packages/cli/src/commands.ts`: entryLine, log; `packages/contract/src/entry.ts`: Input |
| Discovery/replay/cleanup | `packages/cli/src/commands.ts`: roomScopes, replayOf, verifyAll; `verify-cleanup.ts`: observeCleanup |
| Actual issue fields and close kind | `packages/cli/src/commands.ts`: issuesOf, issueAct, issueClose |
| Captured versus inherited Git output | `packages/cli/src/git.ts`: capture, nodeGit |
| Mint acceptance, one-time token, waiter | `packages/cli/src/commands.ts`: clone; `clone-outcome.ts`: waitOutcome |
| Long-lived MCP effects | `packages/cli/src/mcp.ts`: mcpOptions, mcpRoot, mcp |
| Native answer distinctions | `packages/contract/src/transport.ts`: Founded; `result.ts`: Answer |

This source comparison covers those named boundaries, not every branch of
commands.ts. It makes no claim that a new renderer, collector, continuation
or schema has run. Proposed allowance values await explicit review.

After corrected design approval, file separate implementation requests:

1. Reconcile and adopt the shared collector/continuation policy with the
   bounded-read owners, then implement its producer boundaries.
2. Add typed execution and renderers for finite reads, preserving existing
   text adapters and actual provenance.
3. Add native intent/founding and retained custody workflows, preserving
   exact originals and acceptance through every later failure.
4. Add edit/propose/merge/clone workflow results and the MCP mode refusal.
5. Publish the schema and command reference with examples from actual
   result fixtures. Package publication remains separate authority.

This design child closes no all-command implementation parent. No step
implicitly publishes a package, pushes GitHub or deploys Cloudflare.
