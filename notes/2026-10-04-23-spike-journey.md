# Sprint 1 journey on the deployed spike

Request ff9cd8c1. This is an observed run, made on 2026-10-04 between 16:17 and
16:23 Eastern (20:17 to 20:23 UTC) against the spike at
<https://artroom-spike-room.inguz.workers.dev>. The spike was deployed from main
at `b6a9c0b62d82d9ccc4a9fc6570117ae848c33262` (Room version
`a75ebd24-f2f7-4d09-a992-acd716afc421`). Nothing here is reconstructed. Every
command block is copied from the run's recorder, which wrote each command, the
time, the output and the exit code as it happened. Where a command ran outside
the recorder, the text says so.

## What the run shows

| # | Step | Result |
|---|---|---|
| 1 | The CLI and libraries install from the packed `0.1.0-dev.1` tarballs | installed; `artroom` and `artroom-verify` run |
| 2 | Found one room, `sprint-journey`, on the spike | `room_8c39751cac7e49aa97960128bf5b69f2` |
| 3 | Land a policy document that declares the room's acts | policy version `act_11_ae7ecc48`, 8 declared acts |
| 4 | Admit an agent by declaration | `@agent1` joined with a grant for the declared kind `shout` |
| 5 | The agent discovers and submits the declared act over MCP | recorded as `act_16_fd439d42`; an exact retry returns the same record |
| 6 | An agent discovers and submits the same act over HTTPS | recorded as `act_20_4080da83`, signed by `@agent2`'s own key |
| 7 | Read the room log and verify it with the released verifier | verified through entry 20; exit 0; 2 policy decisions replayed |

## What to know before reading

- **The room stays.** `sprint-journey` is left in place so later reports can use
  it. Its repository is `gitseq-spike/0756f42f8962abac079792108d362d23-1`. Its
  registry binding is the one new permanent binding this run made.
- **The CLI covers the work, not the setup.** The CLI has no command to found a
  room or to write an invitation. Those two steps used a 57-line helper script
  with the client and policy packages from the same tarballs (appendix A).
- **Two agents, for a reason.** An agent whose key the room keeps acts through
  the MCP endpoint. An agent that keeps its own key signs envelopes and sends
  them over HTTPS. The run shows one of each. So "the same act over HTTPS" is
  the same declared kind with the same binding, done by a second agent, not the
  first agent again.
- **Verification needed an operator credential.** A member cannot yet get a read
  token for the room's repository from the Room. The run used the operator's
  Cloudflare login to mint one for five minutes, then revoked it.
- **What "verified" covers.** The verifier's own output lists what it cannot
  prove. It is quoted in full in step 12.
- **No secrets are in this note.** Tokens, invitation secrets and private keys
  were written to private files and read from them by the commands.
- **No screenshots.** The whole run was in a terminal, so the record is text.

## Setup: install from the tarballs

The tarballs were packed from the landed commit by `node scripts/pack-release.mjs`
and passed `node scripts/check-release.mjs` (55 checks). They were installed
into an empty directory. These commands ran before the recorder was set up:

```text
$ npm init -y
$ npm install --save-exact generalbusiness-artroom-contract-0.1.0-dev.1.tgz \
    generalbusiness-artroom-policy-0.1.0-dev.1.tgz generalbusiness-artroom-client-0.1.0-dev.1.tgz \
    generalbusiness-artroom-log-0.1.0-dev.1.tgz generalbusiness-artroom-cli-0.1.0-dev.1.tgz
found 0 vulnerabilities
```

`node_modules/.bin` then held `artroom` and `artroom-verify`. Each actor has its
own configuration directory, chosen with `ARTROOM_HOME`: `founder-home`,
`agent-home` and `agent2-home`. No file outside the run directory was touched.

## The run

### 1. The room name is free

A read with no credential. The room does not exist yet.

Observed run, 2026-10-04 16:17:47 EDT:

```text
$ curl -s -o /dev/null -w '%{http_code}\n' https://artroom-spike-room.inguz.workers.dev/v1/rooms/sprint-journey
404
[exit 0]
```

### 2. Found the room

The CLI has no founding command, so a short helper script (appendix A) calls the Room's two founding routes with the client package from the tarballs. Founding needs no credential on the spike. The founder's key and the recovery key are written to private files and never printed.

Observed run, 2026-10-04 16:17:48 EDT:

```text
$ node journey.mjs found
{
 "step": "draft",
 "status": 200,
 "genesis": {
  "format": "artroom-log-v1",
  "name": "sprint-journey",
  "repo": "gitseq-spike/0756f42f8962abac079792108d362d23",
  "admin": {
   "handle": "@founder",
   "key": "key_KPY2yuFWJdzdIEnKNqhOXmRFvNjWXnh6BQdiga3m25w"
  },
  "recovery": "key_RRQw4PEUePb4KWORsUxDo7XYtKzGOvdxqQnH8yrvUoE",
  "roomKey": "key_LjUm8PZ197NS3wfltTTbr_D2xyOog6wgfpAlMKcA-kc",
  "profile": {
   "policy": "artroom-jsonata-v1",
   "jsonata": "2.2.2"
  },
  "createdAt": "2026-10-04T20:17:49.043Z"
 }
}
{
 "step": "found",
 "status": 200,
 "room": "room_8c39751cac7e49aa97960128bf5b69f2"
}
[exit 0]
```

### 3. The founder joins with the CLI

The helper signs one `roster` act that invites `@founder` to hold a key on this machine. The CLI then joins with the invitation link. The link holds a secret, so the command reads it from a private file.

Observed run, 2026-10-04 16:17:56 EDT:

```text
$ node journey.mjs invite-founder
{
 "step": "invite @founder",
 "ok": true,
 "invitation": "act_2_cbc5e0b8",
 "custody": "client",
 "role": null,
 "expiresAt": "2026-10-05T20:17:56.894Z",
 "link": "written to secrets/founder-link.txt"
}
[exit 0]
```

Observed run, 2026-10-04 16:18:00 EDT:

```text
$ ARTROOM_HOME=$PWD/founder-home npx artroom login "$(cat secrets/founder-link.txt)"
Joined sprint-journey as @founder (admin).
Your key key_m05dQow9rwL-5f_H4MQ_CVrFk10G0HIVx1Tenq6SfsU is in <run>/founder-home/keys/room_8c39751cac7e49aa97960128bf5b69f2.json, readable only by you.
Next: artroom claim <paths> --goal "<what you will do>"
[exit 0]
```

Observed run, 2026-10-04 16:18:01 EDT:

```text
$ ARTROOM_HOME=$PWD/founder-home npx artroom log --limit 10
    0  act_0_4c6d8daa  2026-10-04T20:17:53.308Z  system genesis
    1  act_1_ae9b5c4a  2026-10-04T20:17:53.308Z  system policy-activated
    2  act_2_cbc5e0b8  2026-10-04T20:17:56.922Z  roster invite by @founder
    3  act_3_97b7364f  2026-10-04T20:18:01.552Z  roster join by @founder
Head 3, published through -1.
[exit 0]
```

### 4. Before the policy lands, the room declares nothing

A newly founded room starts on the default policy, which is the earlier vocabulary.

Observed run, 2026-10-04 16:18:07 EDT:

```text
$ ARTROOM_HOME=<run>/founder-home npx artroom acts
Policy version act_1_ae9b5c4a is the legacy vocabulary: this room declares no acts of its own.
Use the named commands: claim, propose, note, review, land, release, renew.
[exit 0]
```

### 5. Land a policy document that declares acts

The policy file is `.artroom/policy.json`: the code review policy as declarations, plus one act of this room's own, `shout`, which any admin, maintainer, member or agent may sign on an entry. Appendix A shows how the file is made. The change goes through the ordinary loop: claim, workspace, push, propose, review, land, release. The founder is the only admin, so the room accepts the founder's own approval of `.artroom/**`. The repository setup in `repo/` (`git init`, write the file, commit) was run outside the recorder; its commit is the one the rebase lists.

Observed run, 2026-10-04 16:18:08 EDT:

```text
$ cd repo && ARTROOM_HOME=<run>/founder-home npx artroom claim '.artroom/**' --goal 'Declare acts for the sprint journey'
Claimed lane act_4_c26077e1, lease 1, until 2026-10-04T20:48:09.301Z.
Scope: .artroom/**
Next: artroom workspace
[exit 0]
```

Observed run, 2026-10-04 16:18:13 EDT:

```text
$ cd repo && ARTROOM_HOME=<run>/founder-home npx artroom workspace
Workspace ready for lane act_4_c26077e1, lease 1.
Git remote "artroom": https://6e953d231f1c9aadffbf59537a82e13a.artifacts.cloudflare.net/git/gitseq-spike/0756f42f8962abac079792108d362d23-1--act_4_c26077e1.git
Git can push there until 2026-10-04T20:48:03.566Z. The token is in <run>/repo/.git/artroom/credentials, readable only by you, and is not shown.
Next: git push artroom HEAD, then artroom propose -m "<what changed and why>"
[exit 0]
```

Observed run, 2026-10-04 16:18:17 EDT:

```text
$ cd repo && git fetch artroom 2>&1 | sed -E 's#https://[^ ]+#<fork remote>#' && git branch -r && git rebase --onto artroom/main --root main 2>&1 | tail -1 && git log --oneline | cat
From <fork remote>
 * [new branch]      main       -> artroom/main
  artroom/HEAD -> artroom/main
  artroom/main
Rebasing (1/1)
Successfully rebased and updated refs/heads/main.
b5bb9ca Declare the room's acts: the code review policy and a declared act, shout
69a6b12 Artroom: the first commit on main, with no files (public founding)
[exit 0]
```

Observed run, 2026-10-04 16:18:22 EDT:

```text
$ cd repo && git push artroom HEAD 2>&1 | sed -E 's#https://[^ ]+#<fork remote>#'
To <fork remote>
   69a6b12..b5bb9ca  HEAD -> main
[exit 0]
```

Observed run, 2026-10-04 16:18:22 EDT:

```text
$ cd repo && ARTROOM_HOME=<run>/founder-home npx artroom propose -m 'Adds .artroom/policy.json: the code review policy as declarations, plus one declared act, shout.'
Proposed generation 1 of lane act_4_c26077e1: b5bb9cad8a21.
It needs:
  open  obl_admin-approval: review by role:admin
Preview: pending.
Next: artroom attention, then artroom land --wait when everything is met.
[exit 0]
```

Observed run, 2026-10-04 16:18:31 EDT:

```text
$ cd repo && ARTROOM_HOME=<run>/founder-home npx artroom review 'act_4_c26077e1#1' --approve --scope '.artroom/**' -m 'Sole admin approves the policy change.'
Approved act_4_c26077e1#1 at b5bb9cad8a21.
Met obl_admin-approval.
[exit 0]
```

Observed run, 2026-10-04 16:18:32 EDT:

```text
$ cd repo && ARTROOM_HOME=<run>/founder-home npx artroom land --wait --timeout 120
Landing op_land_7, generation 1: b5bb9cad8a21.
Landed: b5bb9cad8a21 (reserved at seq 9).
Next: artroom release, or artroom renew to keep working on the lane.
[exit 0]
```

Observed run, 2026-10-04 16:18:39 EDT:

```text
$ cd repo && ARTROOM_HOME=<run>/founder-home npx artroom release -m 'Landed; the room now declares its acts.'
Released lane act_4_c26077e1, with a handover note.
Removed the workspace credential for lane act_4_c26077e1, lease 1, from <run>/repo/.git/artroom/credentials.
[exit 0]
```

### 6. The room now declares its acts

Entry 11 is the new policy version. `artroom acts shout` prints the binding: the digest that names the meaning an actor read.

Observed run, 2026-10-04 16:18:40 EDT:

```text
$ ARTROOM_HOME=<run>/founder-home npx artroom acts
Policy version act_11_ae7ecc48, active, declares 8 acts:
  check    Check  [version: check]
  claim    Claim  [none: open; thread: take]
  land     Land  [version: land]
  note     Note  [entry: comment; line: comment]
  propose  Propose  [thread: version]
  release  Release  [thread: release]
  review   Review  [version: review]
  shout    Shout  [entry: comment]
For one act's fields and binding: artroom acts KIND
[exit 0]
```

Observed run, 2026-10-04 16:18:41 EDT:

```text
$ ARTROOM_HOME=<run>/founder-home npx artroom acts shout
shout: Shout
  Who may sign it: admin, maintainer, member, agent.
  On target entry (--entry ACT): comment
    replyTo: an entry ID, optional (the comment step's)
    text: text, up to 2048 bytes
  Binding: sha256:5a66eeb3e96b72726d47014b180d6b2f1a4acbd767facfa30a698b4c38099e14
  Policy version: act_11_ae7ecc48
To do it: artroom act shout --binding sha256:5a66eeb3e96b72726d47014b180d6b2f1a4acbd767facfa30a698b4c38099e14 [target] --set FIELD=VALUE …
[exit 0]
```

### 7. Admit an agent by declaration

The invitation carries a session that grants one declared kind, `shout`, by its binding. The room keeps this agent's key and the agent gets a bearer token. The token is written to a private file and never shown.

Observed run, 2026-10-04 16:18:45 EDT:

```text
$ node journey.mjs invite-agent
{
 "step": "invitation session",
 "kinds": [],
 "acts": {
  "shout": "sha256:5a66eeb3e96b72726d47014b180d6b2f1a4acbd767facfa30a698b4c38099e14"
 },
 "ttlSeconds": 3600
}
{
 "step": "invite @agent1",
 "ok": true,
 "invitation": "act_13_63d1fd56",
 "custody": "room",
 "role": "agent",
 "expiresAt": "2026-10-05T20:18:45.745Z",
 "link": "written to secrets/agent-link.txt"
}
[exit 0]
```

Observed run, 2026-10-04 16:18:45 EDT:

```text
$ ARTROOM_HOME=$PWD/agent-home npx artroom redeem "$(cat secrets/agent-link.txt)"
Redeemed an MCP invitation for @agent1 (agent), valid until 2026-10-04T21:18:46.213Z.
The bearer token is in <run>/agent-home/bearers/room_8c39751cac7e49aa97960128bf5b69f2, readable only by you. It is not shown anywhere else.
MCP URL: https://artroom-spike-room.inguz.workers.dev/v1/rooms/room_8c39751cac7e49aa97960128bf5b69f2/mcp
Next: give your agent that URL with the header "Authorization: Bearer <token from the file>", for example:
  claude mcp add --transport http artroom https://artroom-spike-room.inguz.workers.dev/v1/rooms/room_8c39751cac7e49aa97960128bf5b69f2/mcp --header "Authorization: Bearer $(cat <run>/agent-home/bearers/room_8c39751cac7e49aa97960128bf5b69f2)"
[exit 0]
```

### 8. The agent discovers its tools and the declared acts over MCP

These are plain JSON-RPC calls to the room's MCP endpoint, sent with `curl` by a small wrapper (appendix B) that reads the token from its file. The tool list is short because the agent was granted only `shout`: it sees the read tools, `workspace`, `acts` and `act`. The third call shows a refusal: the `acts` tool takes no `kind` argument.

Observed run, 2026-10-04 16:18:54 EDT:

```text
$ ./mcp.sh '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq -c '{tools: [.result.tools[] | {name, title, readOnly: .annotations.readOnlyHint}]}'
{"tools":[{"name":"workspace","title":"Get the lane's git remote","readOnly":false},{"name":"attention","title":"See what needs you","readOnly":true},{"name":"explain","title":"Explain an act","readOnly":true},{"name":"lane","title":"Read a lane","readOnly":true},{"name":"proposal","title":"Read a proposal","readOnly":true},{"name":"operation","title":"Read or await an operation","readOnly":true},{"name":"acts","title":"List the declared acts","readOnly":true},{"name":"act","title":"Do a declared act","readOnly":false}]}
[exit 0]
```

Observed run, 2026-10-04 16:18:59 EDT:

```text
$ ./mcp.sh '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"acts","arguments":{}}}' | jq -c '.result.structuredContent // .result'
{"vocabulary":"declared","policy":"act_11_ae7ecc48","since":11,"until":null,"steps":"artroom-steps-v1","lanes":"by-scope","acts":{"check":{"declaration":{"label":"Check","targets":{"version":["check"]},"threads":["claim","room"],"who":{"roles":["checker"]}},"binding":"sha256:7f9822b90396941e62a16566436b8349520769ec87a23c0040b33b304622c05f"},"claim":{"declaration":{"body":{"goal":{"max":1024,"requiredFor":["none"],"type":"text"},"plan":{"max":16384,"optional":true,"type":"text"}},"hold":{"scope":"body.scope","workspace":true},"label":"Claim","targets":{"none":["open"],"thread":["take"]},"threads":["claim","room"],"who":{"roles":["maintainer","member","agent"]}},"binding":"sha256:7dae8fd33493267c2046a293a6e2499d3bdc0e710e41633789494227a1b68cc4"},"land":{"declaration":{"label":"Land","targets":{"version":["land"]},"threads":["claim","room"],"who":{"roles":["maintainer","member","agent"]}},"binding":"sha256:fb386c4b767b17a9fc0e3bb5cfa655617a7af7a824d74800b4d3216c7cd83543"},"note":{"declaration":{"body":{"text":{"max":16384,"type":"text"}},"label":"Note","targets":{"entry":["comment"],"line":["comment"]},"threads":["claim","room"],"who":{"roles":["maintainer","member","agent","checker"]}},"binding":"sha256:e8267ab3e4e983a115378f04d2169cc1dbdb5c3774a76469e3e5da2c65049f5c"},"propose":{"declaration":{"body":{"summary":{"max":8192,"type":"text"}},"label":"Propose","targets":{"thread":["version"]},"threads":["claim","room"],"who":{"roles":["maintainer","member","agent"]}},"binding":"sha256:eff3679c89e1571148d969af7eded560c3809aa5f1658f817485e299f06d10ac"},"release":{"declaration":{"label":"Release","targets":{"thread":["release"]},"threads":["claim","room"],"who":{"roles":["maintainer","member","agent"]}},"binding":"sha256:a1903df307a22fe096b922360bdad96eac890f5102217179e959e12eb45c5624"},"review":{"declaration":{"body":{"text":{"max":16384,"type":"text"}},"label":"Review","targets":{"version":["review"]},"threads":["claim","room"],"who":{"roles":["maintainer","member","agent"]}},"binding":"sha256:f65d93317414d20d1a0a6a10ca9d40ab16cefdc32f66f335ef20e17688c3fcad"},"shout":{"declaration":{"body":{"text":{"max":2048,"type":"text"}},"label":"Shout","targets":{"entry":["comment"]},"who":{"roles":["maintainer","member","agent"]}},"binding":"sha256:5a66eeb3e96b72726d47014b180d6b2f1a4acbd767facfa30a698b4c38099e14"}}}
[exit 0]
```

Observed run, 2026-10-04 16:19:00 EDT:

```text
$ ./mcp.sh '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"acts","arguments":{"kind":"shout"}}}' | jq -c '.result.structuredContent // .result'
{"name":"ArtroomError","code":"bad-request","message":"The input does not fit the acts tool: input.kind: is not allowed.","retryable":false}
[exit 0]
```

### 9. The agent submits the declared act over MCP

The act names the binding it read and an idempotency key. The second call repeats the same request with the same key and gets the same record back: the act happened once.

Observed run, 2026-10-04 16:19:08 EDT:

```text
$ ./mcp.sh '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"act","arguments":{"kind":"shout","target":{"act":"act_11_ae7ecc48"},"body":{"text":"Hello from the agent, over MCP."},"binding":"sha256:5a66eeb3e96b72726d47014b180d6b2f1a4acbd767facfa30a698b4c38099e14","idempotencyKey":"sprint1-journey-mcp-1"}}}' | jq -c '.result.structuredContent // .result // .'
{"id":"act_16_fd439d42","seq":16,"kind":"shout","by":{"via":"delegation","member":"@agent1","role":"agent","key":"key_RTtzt6UH6OEDeYkzGGNNVBD0cGuU6Uza1aQDXYiREB4","delegation":"act_15_986b7204","grantor":"key_WiEiSHXVCORy8GCkMGDAr_rAJXFmdcaRIpeSw-khBLk"},"at":"2026-10-04T20:19:08.918Z","flags":[],"anchor":{"act":"act_11_ae7ecc48"},"text":"Hello from the agent, over MCP."}
[exit 0]
```

Observed run, 2026-10-04 16:19:19 EDT:

```text
$ ./mcp.sh '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"act","arguments":{"kind":"shout","target":{"act":"act_11_ae7ecc48"},"body":{"text":"Hello from the agent, over MCP."},"binding":"sha256:5a66eeb3e96b72726d47014b180d6b2f1a4acbd767facfa30a698b4c38099e14","idempotencyKey":"sprint1-journey-mcp-1"}}}' | jq -c '(.result.structuredContent // .result // .) | {id, seq, kind, at}'
{"id":"act_16_fd439d42","seq":16,"kind":"shout","at":"2026-10-04T20:19:08.918Z"}
[exit 0]
```

### 10. A second agent with its own key does the same over HTTPS

`@agent1`'s key is in the room's custody, so its acts travel through the MCP endpoint. To show the signed HTTPS path, a second agent, `@agent2`, joins with a key kept on this machine. `--verbose` shows each request: the CLI reads the declarations from `GET /declarations` and submits a signed envelope to `POST /acts`.

Observed run, 2026-10-04 16:19:19 EDT:

```text
$ node journey.mjs invite-agent-key
{
 "step": "invite @agent2",
 "ok": true,
 "invitation": "act_18_ad37657d",
 "custody": "client",
 "role": "agent",
 "expiresAt": "2026-10-05T20:19:20.506Z",
 "link": "written to secrets/agent2-link.txt"
}
[exit 0]
```

Observed run, 2026-10-04 16:19:20 EDT:

```text
$ ARTROOM_HOME=$PWD/agent2-home npx artroom login "$(cat secrets/agent2-link.txt)"
Joined sprint-journey as @agent2 (agent).
Your key key_Bbes78sd8m9ILGl2B8iSgJOXs5Tqrv5NSz4kL3fWTeI is in <run>/agent2-home/keys/room_8c39751cac7e49aa97960128bf5b69f2.json, readable only by you.
Next: artroom claim <paths> --goal "<what you will do>"
[exit 0]
```

Observed run, 2026-10-04 16:19:25 EDT:

```text
$ ARTROOM_HOME=<run>/agent2-home npx artroom acts shout --verbose
  POST /requests 200 208ms
  GET /log 200 60ms
  GET /declarations 200 62ms
shout: Shout
  Who may sign it: admin, maintainer, member, agent.
  On target entry (--entry ACT): comment
    replyTo: an entry ID, optional (the comment step's)
    text: text, up to 2048 bytes
  Binding: sha256:5a66eeb3e96b72726d47014b180d6b2f1a4acbd767facfa30a698b4c38099e14
  Policy version: act_11_ae7ecc48
To do it: artroom act shout --binding sha256:5a66eeb3e96b72726d47014b180d6b2f1a4acbd767facfa30a698b4c38099e14 [target] --set FIELD=VALUE …
[exit 0]
```

Observed run, 2026-10-04 16:19:26 EDT:

```text
$ ARTROOM_HOME=<run>/agent2-home npx artroom act shout --binding sha256:5a66eeb3e96b72726d47014b180d6b2f1a4acbd767facfa30a698b4c38099e14 --entry act_16_fd439d42 --set text='Hello back, over HTTPS, signed with my own key.' --verbose
  POST /requests 200 246ms
  GET /log 200 70ms
  GET /declarations 200 85ms
  POST /acts 200 124ms
  GET /declarations 200 76ms
Done: Shout (shout), recorded as act_20_4080da83.
[exit 0]
```

### 11. Read the log

Entries 16 and 20 are the two `shout` acts. `artroom explain` says why entry 16 was accepted. The room publishes its log about a minute after the oldest unpublished entry; the last command was run once the log was published through entry 20. Polling `artroom log --limit 1` every 15 seconds in between was not recorded.

Observed run, 2026-10-04 16:19:33 EDT:

```text
$ ARTROOM_HOME=<run>/founder-home npx artroom log --limit 30
    0  act_0_4c6d8daa  2026-10-04T20:17:53.308Z  system genesis
    1  act_1_ae9b5c4a  2026-10-04T20:17:53.308Z  system policy-activated
    2  act_2_cbc5e0b8  2026-10-04T20:17:56.922Z  roster invite by @founder
    3  act_3_97b7364f  2026-10-04T20:18:01.552Z  roster join by @founder
    4  act_4_c26077e1  2026-10-04T20:18:09.301Z  claim by @founder
    5  act_5_074807f0  2026-10-04T20:18:27.843Z  propose by @founder
    6  act_6_30bce378  2026-10-04T20:18:32.315Z  review by @founder
    7  act_7_d737386f  2026-10-04T20:18:33.381Z  land by @founder
    8  act_8_dbddc46f  2026-10-04T20:18:34.756Z  system land-evaluated
    9  act_9_c7fc588d  2026-10-04T20:18:34.809Z  system land-reserved
   10  act_10_6517cf55  2026-10-04T20:18:35.716Z  system land-outcome
   11  act_11_ae7ecc48  2026-10-04T20:18:35.716Z  system policy-activated
   12  act_12_6741782f  2026-10-04T20:18:40.243Z  release (Release) by @founder
   13  act_13_63d1fd56  2026-10-04T20:18:45.783Z  roster invite by @founder
   14  act_14_d0cb31c7  2026-10-04T20:18:46.213Z  roster join by @agent1
   15  act_15_986b7204  2026-10-04T20:18:46.213Z  roster delegate by @agent1
   16  act_16_fd439d42  2026-10-04T20:19:08.918Z  shout (Shout) by @agent1
   17  act_17_7dde50fa  2026-10-04T20:19:11.316Z  system checkpoint
   18  act_18_ad37657d  2026-10-04T20:19:20.548Z  roster invite by @founder
   19  act_19_ceafb365  2026-10-04T20:19:21.182Z  roster join by @agent2
   20  act_20_4080da83  2026-10-04T20:19:27.196Z  shout (Shout) by @agent2
Head 20, published through 15.
[exit 0]
```

Observed run, 2026-10-04 16:19:34 EDT:

```text
$ ARTROOM_HOME=<run>/founder-home npx artroom explain act_16_fd439d42
act_16_fd439d42: shout (Shout), accepted, not yet published.
Meaning: shout as declared in policy version act_11_ae7ecc48, binding sha256:5a66eeb3e96b72726d47014b180d6b2f1a4acbd767facfa30a698b4c38099e14.
Authority: delegation, @agent1 (agent).
Held: R-ADM-3: authority by case delegation
[exit 0]
```

Observed run, 2026-10-04 16:22:05 EDT:

```text
$ ARTROOM_HOME=$PWD/founder-home npx artroom log --after 19 --limit 5
   20  act_20_4080da83  2026-10-04T20:19:27.196Z  shout (Shout) by @agent2
   21  act_21_b2038f88  2026-10-04T20:20:23.126Z  system checkpoint
Head 21, published through 20.
[exit 0]
```

### 12. Verify the published log with the released verifier

`artroom-verify` is the command the log tarball installs. It fetches `refs/artroom/log` from the room's repository and checks it. The Room has no route that issues a read token for that repository, so the helper in appendix C mints a 300-second read token with the operator's Cloudflare login, gives it to git through the environment, and revokes it afterwards.

Observed run, 2026-10-04 16:22:06 EDT:

```text
$ node verify.mjs 0756f42f8962abac079792108d362d23-1
{
 "step": "repository",
 "name": "0756f42f8962abac079792108d362d23-1",
 "remote": "https://6e953d231f1c9aadffbf59537a82e13a.artifacts.cloudflare.net/git/gitseq-spike/0756f42f8962abac079792108d362d23-1.git"
}
{"step":"read token","id":"ca17r0j6bnkqr7bd","scope":"read","ttl":300}
$ npx artroom-verify https://6e953d231f1c9aadffbf59537a82e13a.artifacts.cloudflare.net/git/gitseq-spike/0756f42f8962abac079792108d362d23-1.git
Verified. Every check this run makes passed; what it cannot prove is listed below.
Mode: full.
Room: room_8c39751cac7e49aa97960128bf5b69f2
Log commit: 98538eebda09d5ca041c9838f023f5d2e1736129 (2 commits)
Published through entry 20; verified through entry 20 (act_20_4080da83).
Policy decisions replayed: 2.
Carry accounting: partial.
Cannot prove: Whether any act was admitted after the last published entry: unpublished acts cannot be proven to exist or not to exist.
Cannot prove: Lanes, leases, obligations and landings (R-LOG-15): verify checks each act's authority and replays every policy decision, but does not re-derive lane, lease, obligation or landing transitions, or the effects in receipts.
Cannot prove: The room clock: expiry checks use each entry's recorded `at`, which only the room key vouches for.
Cannot prove: Refusals that are never recorded (R-ADM-8): kind-undeclared, binding-stale and the other refusals of admission steps 1 to 6 leave no entry, so verify can neither see nor prove them.
Cannot prove: Under a v1 document, entries are judged by the legacy vocabulary as before declared acts: the decisions present are replayed, but the calls the room had to make are not derived (R-DECL-1).
Cannot prove: Under a v2 document, the required evaluation calls are derived and their inputs rebuilt from the thread, roster, obligation and evidence fold, which takes receipt effects as recorded: lane, lease and landing transitions, the obligations effects, and the platform guards behind a recorded refusal are not re-derived (stage 6).
Cannot prove: A version's changed paths are checked against Git objects, from the base its context names to its head, when the objects are present; without them they are the retained context's, reported as git-unwitnessed. That the base is the merge base of main and the head needs main's history, which the log does not carry.
Cannot prove: The paths changed since an earlier verdict's head, which decide whether it carries, are read from Git objects. Without them they are the retained carry context's, where one is recorded; where none is, whether the verdict carried is undecided, and so is each land input that depends on it. Each is reported as git-unwitnessed.
Cannot prove: Whether the room prepared a check's integration, for a version or landing with no prepared event: rooms seal prepared events from stage 4 (R-DECL-20); verify checks a check against them where they are present. Until then a check on a filtered snapshot does not name the integration it counts for, and a check carry's new tree and snapshot are not in the log: verify takes them from the retained context and reports git-unwitnessed.
Cannot prove: Carry judgements are accounted for in part (R-CARRY-13). Verify replays each check-carried judgement that is recorded, and a carry that is not recorded meets no obligation. It detects a second judgement of the same check, a carry that skipped a newer passing check, and a land evaluation made while a blocking obligation was open. It does not derive the whole list of judgements the room owed. So it cannot show that a judgement which did not carry is missing when no later judgement carried; that a whole carry pass is missing, as for an advisory obligation; that the recorded judgements are all of them, in the room's order, with the inputs and the evaluation budget the room used; or that an extra judgement belongs to no pass. The log does not record when the room started or ended a pass, waited, was cancelled, prepared a landing again, or skipped carrying for a recovery landing.
Cannot prove: What a verified prefix means: every check this run makes passed for the entries it names. It does not mean that every duty of the room was done, that publication is complete, or that each transition of the room's state was derived again.
npm notice
npm notice New major version of npm available! 11.19.1 -> 12.2.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.2.0
npm notice To update run: npm install -g npm@12.2.0
npm notice
[artroom-verify exit 0]
{"step":"revoke read token","id":"ca17r0j6bnkqr7bd","revoked":true}
[exit 0]
```

## Appendix A: the founding and invitation helper (`journey.mjs`)

```js
// Sprint 1 journey helper: the steps the artroom CLI has no command for.
// Uses only the packed 0.1.0-dev.1 tarballs. Secrets go to ./secrets (mode 600), never to stdout.
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { connect, generateSigner, signerFromJwk, signValue, invitationSession, toBase64Url } from "@generalbusiness/artroom-client";
import { codeReviewPolicy, defaultPolicy, validatePolicyV2 } from "@generalbusiness/artroom-policy";

const BASE = "https://artroom-spike-room.inguz.workers.dev";
const NAME = "sprint-journey";
const save = (f, v) => writeFileSync(`secrets/${f}`, typeof v === "string" ? v : JSON.stringify(v), { mode: 0o600 });
const load = (f) => JSON.parse(readFileSync(`secrets/${f}`, "utf8"));
const post = async (path, body) => {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const adminRoom = async () => connect({ url: BASE }, load("room.json").room, { kind: "key", signer: await signerFromJwk(load("admin.jwk.json")) });
const invite = async (room, op, file) => {
  const secret = randomBytes(32);
  const secretHash = `sha256:${createHash("sha256").update(secret).digest("hex")}`;
  const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
  const r = await room.roster({ ...op, expiresAt, secretHash });
  const id = r.record?.id ?? r.id ?? r.act?.id;
  save(file, `${BASE}/rooms/${load("room.json").room}/join#i=${id}&s=${toBase64Url(secret)}\n`);
  console.log(JSON.stringify({ step: `invite ${op.member}`, ok: r.ok ?? true, invitation: id, custody: op.custody, role: op.role ?? null, expiresAt, link: `written to secrets/${file}` }, null, 1));
  if (!id) console.log(JSON.stringify(r, null, 1).slice(0, 1500));
};

const cmd = process.argv[2];
if (cmd === "found") {
  const admin = await generateSigner({ extractable: true });
  const recovery = await generateSigner({ extractable: true });
  save("admin.jwk.json", admin.jwk); save("recovery.jwk.json", recovery.jwk);
  const d = await post("/v1/rooms", { name: NAME, repo: { kind: "new" }, admin: { handle: "@founder", key: admin.signer.key }, recovery: recovery.signer.key });
  console.log(JSON.stringify({ step: "draft", status: d.status, genesis: d.body.genesis, error: d.body.code, message: d.body.message }, null, 1));
  if (d.status !== 200) process.exit(1);
  const sig = await signValue("artroom-genesis-v1", d.body.genesis, admin.signer);
  const f = await post("/v1/rooms/found", { genesis: d.body.genesis, sig, draft: d.body.draft });
  console.log(JSON.stringify({ step: "found", status: f.status, room: f.body.room, error: f.body.code, message: f.body.message }, null, 1));
  if (f.status !== 200) process.exit(1);
  save("room.json", { room: f.body.room, name: NAME, genesis: d.body.genesis });
} else if (cmd === "invite-founder") {
  await invite(await adminRoom(), { op: "invite", member: "@founder", custody: "client" }, "founder-link.txt");
} else if (cmd === "policy") {
  const p = codeReviewPolicy(defaultPolicy());
  p.acts = { ...p.acts, shout: { label: "Shout", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 2048 } }, who: { roles: ["maintainer", "member", "agent"] } } };
  const problems = validatePolicyV2(p);
  if (process.argv[3] === "--check") console.log(JSON.stringify({ format: p.format, acts: Object.keys(p.acts), problems }, null, 1));
  else process.stdout.write(JSON.stringify(p, null, 2) + "\n");
} else if (cmd === "invite-agent") {
  const room = await adminRoom();
  const session = await invitationSession(room, "agent", { kinds: ["shout"], ttlSeconds: 3600 });
  console.log(JSON.stringify({ step: "invitation session", kinds: session.kinds, acts: session.acts, ttlSeconds: session.ttlSeconds }, null, 1));
  await invite(room, { op: "invite", member: "@agent1", role: "agent", custody: "room", session }, "agent-link.txt");
} else if (cmd === "invite-agent-key") {
  // A second agent that keeps its own key (client custody) and signs its own envelopes over HTTPS.
  await invite(await adminRoom(), { op: "invite", member: "@agent2", role: "agent", custody: "client" }, "agent2-link.txt");
} else { console.error("usage: node journey.mjs found|invite-founder|policy [--check]|invite-agent|invite-agent-key"); process.exit(2); }
```

## Appendix B: the MCP call wrapper (`mcp.sh`) and the recorder (`run.sh`)

```bash
#!/bin/bash
# One JSON-RPC call to the room's MCP endpoint with the agent's bearer token (read from its file, never printed).
MCP=https://artroom-spike-room.inguz.workers.dev/v1/rooms/room_8c39751cac7e49aa97960128bf5b69f2/mcp
curl -sS -X POST "$MCP" -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -H "mcp-protocol-version: 2025-06-18" \
  -H "authorization: Bearer $(cat <run>/agent-home/bearers/room_8c39751cac7e49aa97960128bf5b69f2)" \
  -d "$1" | sed -E 's/^data: //; /^event: /d; /^$/d'
```

```bash
#!/bin/bash
# Append a command and its verbatim output to transcript.log with the time.
cd <run>
{ echo; echo "### $(TZ=America/New_York date '+%Y-%m-%d %H:%M:%S %Z')"; echo "\$ $*"; } >> transcript.log
out=$(eval "$@" 2>&1); rc=$?
printf '%s\n' "$out" >> transcript.log; echo "[exit $rc]" >> transcript.log
printf '%s\n[exit %s]\n' "$out" "$rc"
```

## Appendix C: the verification helper (`verify.mjs`)

```js
// Verify the room's published log with the released verifier (artroom-verify from the log tarball).
// The Room has no route that issues a read token for the canonical repository, so this mints a
// 300-second read token with the operator's Cloudflare login, passes it to git by environment only,
// and revokes it afterwards. The token is never printed.
import { readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const ACCT = "6e953d231f1c9aadffbf59537a82e13a", NS = "gitseq-spike", REPO = process.argv[2];
const oauth = () => /^oauth_token = "([^"]+)"/m.exec(readFileSync(join(homedir(), "Library/Preferences/.wrangler/config/default.toml"), "utf8"))[1];
const api = async (method, path, body) => (await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/artifacts/namespaces/${NS}${path}`, {
  method, headers: { authorization: `Bearer ${oauth()}`, "content-type": "application/json", "user-agent": "artroom-sprint-journey/1.0" }, ...(body ? { body: JSON.stringify(body) } : {}),
})).json().catch(() => ({}));
const info = await api("GET", `/repos/${REPO}`);
const remote = info.result?.remote;
console.log(JSON.stringify({ step: "repository", name: info.result?.name, remote }, null, 1));
if (!remote) { console.log(JSON.stringify(info.errors ?? info).slice(0, 400)); process.exit(1); }
const t = await api("POST", "/tokens", { repo: REPO, scope: "read", ttl: 300 });
if (!t.result?.plaintext) { console.log(JSON.stringify({ step: "read token", ok: false, errors: t.errors })); process.exit(1); }
console.log(JSON.stringify({ step: "read token", id: t.result.id, scope: "read", ttl: 300 }));
const env = { ...process.env, HOME: tmpdir(), GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${t.result.plaintext}`, GIT_TERMINAL_PROMPT: "0" };
const args = [remote, ...process.argv.slice(3)];
console.log(`$ npx artroom-verify ${args.join(" ")}`);
const v = spawnSync("npx", ["artroom-verify", ...args], { env, encoding: "utf8" });
const scrub = (s) => (s ?? "").split(t.result.plaintext).join("<token>");
process.stdout.write(scrub(v.stdout)); process.stderr.write(scrub(v.stderr));
console.log(`[artroom-verify exit ${v.status}]`);
const r = await api("DELETE", `/tokens/${t.result.id}`);
console.log(JSON.stringify({ step: "revoke read token", id: t.result.id, revoked: r.success === true }));
process.exit(v.status ?? 1);
```
