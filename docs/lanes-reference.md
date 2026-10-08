# Lane reference

This file is generated. Do not edit it. `packages/lanes/scripts/reference.mjs` writes it from the two lane
definitions in `packages/lanes/src`. [lanes.md](lanes.md) says how to read a row.

The stamp: the definitions this file was generated from, by their pinned digests.

| Definition | Digest | Canonical bytes |
|---|---|---|
| `issue` | `sha256:325cb4f33da9deb1a31d85ba0f1456068d4d9d08009978b779aed70cb08e00ad` | 46160 |
| `change` | `sha256:3f0389ba644e6d58e96a352debcc77d01661ffcf349c6db53d0645c2513eae70` | 59715 |

The rows were written from Lane forms and browser flow, revision 14, at `4b3bf5da`.

How to read the tables:

- A final state is in bold. `?` marks a field or a member that is optional.
- A slot's flags are in brackets: `fixed`, `required`, `list` and `author`. A slot with none has none.
- "Guards, effects, sends, attention" gives the number of forms of each kind that the row writes. The forms
  themselves are in `packages/lanes/src`.
- "Settles" is the pending state that the row's entry ends, where the row declares one.
- "Needs" names the capability versions whose code the row needs. The validator reads such a row and derives
  nothing of it. The derive package holds that code as pure functions, and the production ports hold it. A runtime that lacks it does not found
  or create a scope under either definition: `unsupported-definition`.

## `issue`

Name `issue`. Genesis act `file`. Capabilities listed: `hold@1`, `git-read@1`. Rule expressions: 0.

### Item types of `issue`: 12

| Type | How many | States | Slots | Needs |
|---|---|---|---|---|
| `intent` | one | `open` (initial), `closed` | `requester`: member (fixed, required); `assignees`: member (list of at most 10); `parent`: scope of kind `lane` (fixed); `conditionsAt`: fact of kind `file`, `revise` under `issue` (required); `judgedAt`: fact of kind `file`, `revise` under `issue`; `currentPlan`: item of type `plan`; `closedBy`: fact of kind `close-own`, `close-any`, `closes` under `issue`; `title`: text, at most 256 bytes (required); `body`: text, at most 65536 bytes, detached; `conditions`: list of at most 16, each a text, at most 4096 bytes (required); `labels`: list of at most 20, each a text, at most 64 bytes; `closeReason`: enum: `completed`, `not-planned`; `satisfied`: bool; `number`: int, 1 to 1000000000; `parentItem`: int, 0 to 1000000000 (fixed); `judgeEvidence`: list of at most 32, each a digest; `judgeNote`: text, at most 4096 bytes |  |
| `commitment` | many, at most 64 live | `offered` (initial), `proposed`, `accepted`, **`declined`**, **`withdrawn`**, **`cancelled`**, **`fulfilled`** | `requester`: member (fixed, required); `offeree`: member (fixed); `performer`: member (author); `successor`: member; `conditionsAt`: fact of kind `file`, `revise` under `issue` (fixed, required); `termsAt`: fact of kind `file`, `revise`, `propose-terms` under `issue` (fixed, required); `conditions`: list of at most 16, each a text, at most 4096 bytes (fixed, required) |  |
| `report` | many, at most 64 live | `reported` (initial), **`accepted`**, **`refused`** | `reporter`: member (fixed, required); `authors`: member (fixed, list of at most 64); `under`: item of type `commitment` (fixed, required); `conditionsAt`: fact of kind `file`, `revise` under `issue` (fixed, required); `termsAt`: fact of kind `file`, `revise`, `propose-terms` under `issue` (fixed, required); `acceptedAt`: fact of kind `accept-report` under `issue`; `commit`: commit (fixed, required); `tree`: tree (fixed, required); `claims`: list of at most 32, each a text, at most 1024 bytes (fixed); `evidence`: list of at most 32, each a digest (fixed); `summary`: text, at most 65536 bytes, detached; `reason`: text, at most 4096 bytes |  |
| `ask` | many, at most 64 live | `asked` (initial), `answered`, **`settled`**, **`withdrawn`** | `asker`: member (fixed, required); `addressee`: member (fixed, required); `question`: text, at most 4096 bytes (fixed, required); `answer`: text, at most 4096 bytes |  |
| `block` | many, at most 32 live | `blocked` (initial), **`released`** | `commitment`: item of type `commitment` (fixed, required); `on`: fact of kind `ask` under `issue` (fixed, required); `releasedBy`: fact of kind `answer` under `issue`; `reason`: text, at most 4096 bytes |  |
| `plan` | many, at most 16 live | `open` (initial), `sealed`, **`superseded`** | `planner`: member (fixed, required); `conditionsAt`: fact of kind `file`, `revise` under `issue` (fixed, required) |  |
| `concern` | many, at most 100 live | `creating` (initial), `created`, **`refused`**, **`conflict`**, `delivered`, **`dropped`** | `plan`: item of type `plan` (fixed, required); `child`: scope of kind `lane`; `result`: fact of kind `offer`, `propose-terms` under `issue`; `purpose`: text, at most 4096 bytes (fixed, required); `role`: enum: `required`, `optional` (fixed, required); `interface`: text, at most 4096 bytes (fixed) |  |
| `decision` | many, at most 32 live | **`recorded`** (initial) | `decider`: member (fixed, required); `concern`: item of type `concern` (fixed, required); `replacedBy`: item of type `concern` (fixed); `acceptance`: fact of kind `accept-report` under `issue` (fixed); `terms`: fact of kind `file`, `revise`, `propose-terms` under `issue` (fixed); `kind`: enum: `replaced`, `excluded`, `accepted-as-delivered` (fixed, required); `reason`: text, at most 4096 bytes (fixed, required) |  |
| `input` | many, at most 32 live | `selected` (initial), **`replaced`** | `selector`: member (fixed, required); `authors`: member (fixed, list of at most 64); `for`: item of type `commitment` (fixed, required); `report`: fact of kind `report` under `issue` (fixed, required); `accepted`: fact of kind `accept-report` under `issue` (fixed, required) |  |
| `comment` | many, at most 5000 live | `visible` (initial), `collapsed`, **`redacted`** | `author`: member (fixed, required); `mentioned`: member (fixed, list of at most 16); `replyTo`: item of type `comment`; `body`: text, at most 65536 bytes, detached; `collapseReason`: text, at most 1024 bytes |  |
| `hold` | many, at most 16 live | `held` (initial), **`ended`** | `holder`: member (required); `under`: item of type `commitment` (fixed, required); `extent`: text, at most 1024 bytes; `ends`: time (required); `epoch`: int, 1 to 1000000 (required) |  |
| `export` | many, at most 16 live | `authorized` (initial), **`done`**, **`refused`** | `from`: member (fixed, required); `to`: member (fixed, required); `authorizer`: member (fixed, required); `hold`: item of type `hold` (fixed, required) |  |

### Acts of `issue`: 50

| Kind | Step | Grant | Other items | Fields | Settles | Guards, effects, sends, attention | Needs |
|---|---|---|---|---|---|---|---|
| `file` (genesis) | open on `intent` | `issue.open` | None | `opener`: member; `title`: text, at most 256 bytes; `body?`: text, at most 65536 bytes, detached; `conditions`: list of at most 16, each a text, at most 4096 bytes; `number?`: int, 1 to 1000000000; `origin?`: fact of kind `add-concern` under `issue` |  | 0, 8, 1, 0 |  |
| `edit-own` | transition on `intent` | `issue.edit-own` | None | `title?`: text, at most 256 bytes; `body?`: text, at most 65536 bytes, detached |  | 1, 2, 1, 0 |  |
| `edit-any` | transition on `intent` | `issue.edit-any` | None | `title?`: text, at most 256 bytes; `body?`: text, at most 65536 bytes, detached |  | 0, 2, 1, 0 |  |
| `revise` | transition on `intent` | `issue.revise` | None | `conditions`: list of at most 16, each a text, at most 4096 bytes |  | 2, 2, 0, 0 |  |
| `label` | transition on `intent` | `issue.triage` | None | `labels`: list of at most 20, each a text, at most 64 bytes |  | 0, 1, 1, 0 |  |
| `assign` | transition on `intent` | `issue.triage` | None | `assignees`: list of at most 10, each a member |  | 0, 1, 1, 1 |  |
| `close-own` | transition on `intent` | `issue.close-own` | None | `reason?`: enum: `completed`, `not-planned` |  | 2, 3, 1, 0 |  |
| `close-any` | transition on `intent` | `issue.triage` | None | `reason?`: enum: `completed`, `not-planned` |  | 1, 3, 1, 0 |  |
| `reopen-own` | transition on `intent` | `issue.close-own` | None | None |  | 2, 3, 1, 0 |  |
| `reopen-any` | transition on `intent` | `issue.triage` | None | None |  | 1, 3, 1, 0 |  |
| `judge` | transition on `intent` | `issue.judge` | None | `satisfied`: bool; `evidence?`: list of at most 32, each a digest; `note?`: text, at most 4096 bytes |  | 1, 4, 0, 0 |  |
| `offer` | open on `commitment` | `issue.request` | `goal`: `intent` the one item of its type | `offeree?`: member |  | 1, 5, 0, 1 |  |
| `propose-terms` | open on `commitment` | `issue.promise` | `goal`: `intent` the one item of its type | `conditions`: list of at most 16, each a text, at most 4096 bytes |  | 1, 7, 0, 0 |  |
| `accept` | transition on `commitment` | `issue.promise` | None | `terms`: fact of kind `file`, `revise`, `propose-terms` under `issue` |  | 3, 2, 0, 1 |  |
| `agree` | transition on `commitment` | `issue.request` | None | `terms`: fact of kind `file`, `revise`, `propose-terms` under `issue` |  | 3, 1, 0, 0 |  |
| `decline` | transition on `commitment` | `issue.promise` | None | None |  | 2, 1, 0, 0 |  |
| `withdraw` | transition on `commitment` | `issue.promise` | None | None |  | 2, 1, 0, 1 |  |
| `cancel` | transition on `commitment` | `issue.request` | None | None |  | 2, 1, 0, 1 |  |
| `offer-handover` | transition on `commitment` | `issue.promise` | None | `successor`: member |  | 2, 1, 0, 1 |  |
| `accept-handover` | transition on `commitment` | `issue.promise` | None | `terms`: fact of kind `file`, `revise`, `propose-terms` under `issue` |  | 4, 2, 0, 2 |  |
| `decline-handover` | transition on `commitment` | `issue.promise` | None | None |  | 2, 1, 0, 0 |  |
| `fulfil` | transition on `commitment` | `issue.request` | `report`: `report` by the field `report`; `goal`: `intent` the one item of its type | `report`: item of type `report` |  | 5, 1, 1, 0 |  |
| `take-hold` | open on `hold` | `issue.work` | `commitment`: `commitment` by the field `commitment` | `commitment`: item of type `commitment`; `extent?`: text, at most 1024 bytes |  | 3, 4, 0, 0 |  |
| `report` | open on `report` | `issue.work` | `commitment`: `commitment` by the field `commitment` | `commitment`: item of type `commitment`; `terms`: fact of kind `file`, `revise`, `propose-terms` under `issue`; `commit`: commit; `tree`: tree; `claims?`: list of at most 32, each a text, at most 1024 bytes; `evidence?`: list of at most 32, each a digest; `summary?`: text, at most 65536 bytes, detached |  | 5, 11, 0, 1 | `git-read@1`, `hold@1` |
| `accept-report` | transition on `report` | `issue.request` | `commitment`: `commitment` by the field `commitment` | `commitment`: item of type `commitment`; `terms`: fact of kind `file`, `revise`, `propose-terms` under `issue` |  | 6, 2, 0, 0 |  |
| `refuse-report` | transition on `report` | `issue.request` | `commitment`: `commitment` by the field `commitment` | `commitment`: item of type `commitment`; `reason`: text, at most 4096 bytes |  | 3, 3, 0, 1 | `hold@1` |
| `ask` | open on `ask` | `issue.comment` | None | `addressee`: member; `question`: text, at most 4096 bytes |  | 0, 3, 0, 1 |  |
| `answer` | transition on `ask` | `issue.comment` | None | `answer`: text, at most 4096 bytes |  | 2, 2, 0, 1 |  |
| `settle-ask` | transition on `ask` | `issue.comment` | None | None |  | 2, 1, 0, 0 |  |
| `withdraw-ask` | transition on `ask` | `issue.comment` | None | None |  | 2, 1, 0, 0 |  |
| `block` | open on `block` | `issue.work` | `commitment`: `commitment` by the field `commitment` | `commitment`: item of type `commitment`; `on`: fact of kind `ask` under `issue`; `reason?`: text, at most 4096 bytes |  | 3, 3, 0, 0 |  |
| `release-block` | transition on `block` | `issue.work` | `commitment`: `commitment` by the field `commitment` | `commitment`: item of type `commitment`; `answer`: fact of kind `answer` under `issue` |  | 6, 2, 0, 0 |  |
| `use-input` | open on `input` | `issue.work` | `commitment`: `commitment` by the field `commitment` | `commitment`: item of type `commitment`; `accepted`: fact of kind `accept-report` under `issue`; `report`: fact of kind `report` under `issue` |  | 6, 5, 0, 0 |  |
| `replace-input` | transition on `input` | `issue.work` | `commitment`: `commitment` by the field `commitment` | `commitment`: item of type `commitment` |  | 3, 1, 0, 0 |  |
| `open-plan` | open on `plan` | `issue.plan` | `goal`: `intent` the one item of its type | None |  | 1, 2, 0, 0 |  |
| `add-concern` | open on `concern` | `issue.plan` | `plan`: `plan` by the field `plan` | `plan`: item of type `plan`; `purpose`: text, at most 4096 bytes; `role`: enum: `required`, `optional`; `interface?`: text, at most 4096 bytes; `title`: text, at most 256 bytes; `body?`: text, at most 65536 bytes, detached; `conditions`: list of at most 16, each a text, at most 4096 bytes |  | 3, 4, 1, 0 |  |
| `seal-plan` | transition on `plan` | `issue.plan` | `goal`: `intent` the one item of its type; `current`: `plan` through the slot `currentPlan` of `also.goal` | `goalAt`: fact of kind `file`, `revise` under `issue`; `required`: list of at most 32, each a record of `item` (item of type `concern`), `child?` (scope of kind `lane`); `optional`: list of at most 32, each a record of `item` (item of type `concern`), `child?` (scope of kind `lane`) |  | 8, 3, 0, 0 |  |
| `withdraw-plan` | transition on `plan` | `issue.plan` | `goal`: `intent` the one item of its type | None |  | 2, 2, 0, 0 |  |
| `resolve-concern` | open on `decision` | `issue.plan` | `concern`: `concern` by the field `concern`; `plan`: `plan` through the slot `plan` of `also.concern`; `goal`: `intent` the one item of its type; `replacement`: `concern` by the field `replacedBy` | `concern`: item of type `concern`; `kind`: enum: `replaced`, `excluded`, `accepted-as-delivered`; `reason`: text, at most 4096 bytes; `replacedBy?`: item of type `concern`; `acceptance?`: fact of kind `accept-report` under `issue`; `terms?`: fact of kind `file`, `revise`, `propose-terms` under `issue` |  | 3, 7, 0, 0 |  |
| `drop-concern` | transition on `concern` | `issue.plan` | None | None |  | 1, 1, 1, 0 |  |
| `comment` | open on `comment` | `issue.comment` | None | `body`: text, at most 65536 bytes, detached; `replyTo?`: item of type `comment`; `mentions?`: list of at most 16, each a member |  | 0, 4, 0, 1 |  |
| `edit-comment-own` | transition on `comment` | `issue.comment` | None | `body`: text, at most 65536 bytes, detached |  | 2, 1, 0, 0 |  |
| `edit-comment-any` | transition on `comment` | `issue.edit-any` | None | `body`: text, at most 65536 bytes, detached |  | 1, 1, 0, 0 |  |
| `collapse-comment` | transition on `comment` | `issue.triage` | None | `reason`: text, at most 1024 bytes |  | 1, 2, 0, 0 |  |
| `expand-comment` | transition on `comment` | `issue.triage` | None | None |  | 1, 2, 0, 0 |  |
| `redact-comment-own` | transition on `comment` | `issue.comment` | None | None |  | 2, 2, 0, 0 |  |
| `redact-comment-any` | transition on `comment` | `issue.edit-any` | None | None |  | 1, 2, 0, 0 |  |
| `renew-hold` | transition on `hold` | `issue.work` | `commitment`: `commitment` through the slot `under` of `on` | None |  | 4, 2, 0, 0 |  |
| `release-hold` | transition on `hold` | `issue.work` | None | None |  | 2, 1, 0, 0 |  |
| `authorize-export` | open on `export` | `work.export` | `hold`: `hold` by the field `hold` | `hold`: item of type `hold`; `to`: member |  | 1, 4, 0, 0 |  |

### Handlers of `issue`: 7

| Name | Class and message | From | Opens | Copies | Other items | Fields | Settles | Guards, effects, sends, attention | Needs |
|---|---|---|---|---|---|---|---|---|---|
| `result` | relate `result` | `lane` under `issue` | Nothing | 100 | `concern`: `concern` by the field `parentItem`; `goal`: `intent` the one item of its type | `parentItem`: item of type `concern`; `commitment`: fact of kind `offer`, `propose-terms` under `issue`; `report`: fact of kind `report` under `issue`; `acceptance`: fact of kind `accept-report` under `issue`; `conditions`: fact of kind `file`, `revise` under `issue`; `terms`: fact of kind `file`, `revise`, `propose-terms` under `issue` | `also.concern` in `created` | 2, 2, 0, 1 |  |
| `parent-dropped` | tell `parent-dropped` | `lane` under `issue` | Nothing |  | `goal`: `intent` the one item of its type | None |  | 1, 0, 0, 0 |  |
| `pin-confirm` | tell `pin-confirm` | `lane` under `change` | Nothing |  | None | `commit`: commit |  | 3, 1, 0, 0 | `hold@1` |
| `unpin` | tell `unpin` | `lane` under `change` | Nothing |  | None | `manifest`: fact of kind `propose-manifest` under `change`; `commit`: commit; `because`: enum: `superseded`, `published`; `merge?`: fact of kind `merge` under `change` |  | 5, 1, 0, 0 | `hold@1` |
| `closes` | relate `closes` | `lane` under `change` | Nothing | 32 | `goal`: `intent` the one item of its type | `commit?`: commit; `plan?`: fact of kind `seal-plan` under `issue` | a copy in `set` | 0, 3, 0, 0 |  |
| `export-license` | tell `export-license` | `task` under `platform:task` | Nothing |  | `export`: `export` by the field `export`; `target`: `hold` by the field `hold` | `export`: fact of kind `authorize-export` under `issue`; `checkpoint`: digest; `hold`: item of type `hold`; `instance`: text, at most 128 bytes; `k`: int, 1 to 3 |  | 5, 1, 0, 0 | `hold@1` |
| `export-settled` | tell `export-settled` | `task` under `platform:task` | Nothing |  | `export`: `export` by the field `export` | `export`: fact of kind `authorize-export` under `issue`; `final`: enum: `confirmed`, `withheld` | `also.export` in `authorized` | 2, 3, 0, 0 | `hold@1` |

### Timed rules of `issue`: 1

| Name | On | In states | Deadline slot | Effects, attention |
|---|---|---|---|---|
| `hold-end` | `hold` | `held` | `ends` | 1, 0 |

## `change`

Name `change`. Genesis act `open`. Capabilities listed: `hold@1`, `git-read@1`. Rule expressions: 0.

### Item types of `change`: 14

| Type | How many | States | Slots | Needs |
|---|---|---|---|---|
| `proposal` | one | `draft` (initial), `open`, `closed`, **`merged`** | `author`: member (fixed, required); `assignees`: member (list of at most 10); `destination`: scope of kind `destination` (fixed, required); `rulesScope`: scope of kind `rules` (fixed, required); `title`: text, at most 256 bytes (required); `body`: text, at most 65536 bytes, detached; `labels`: list of at most 20, each a text, at most 64 bytes; `number`: int, 1 to 1000000000 |  |
| `manifest` | many, at most 64 live | `current` (initial), **`superseded`** | `integrator`: member (fixed, required); `authors`: member (fixed, required, list of at most 64); `goal`: fact of kind `file`, `revise` under `issue` (fixed); `plan`: fact of kind `seal-plan` under `issue` (fixed); `staging`: scope of kind `lane` (fixed); `under`: item of type `commitment` (fixed); `pin`: fact of kind `hold@1:check` under `issue` (fixed); `base`: commit (fixed, required); `integration`: commit (fixed); `tree`: tree (fixed); `path`: text, at most 1024 bytes (fixed); `digest`: digest (fixed); `size`: int, 0 to 65536 (fixed); `selected`: list of at most 32, each a record of `accepted` (fact of kind `accept-report` under `issue`), `report` (fact of kind `report` under `issue`) (fixed); `decisions`: list of at most 32, each a fact of kind `resolve-concern` under `issue` (fixed); `complete`: bool (fixed, required) | `hold@1` |
| `review` | many, at most 256 live | `submitted` (initial), **`superseded`**, **`withdrawn`**, **`dismissed`** | `reviewer`: member (fixed, required); `manifest`: item of type `manifest` (fixed, required); `verdict`: enum: `approve`, `request-changes` (fixed, required); `extent`: text, at most 64 bytes (fixed); `body`: text, at most 65536 bytes, detached; `dismissal`: text, at most 4096 bytes |  |
| `review-request` | many, at most 64 live | `open` (initial), **`met`**, **`withdrawn`** | `requested`: member (fixed, required); `requester`: member (fixed, required) |  |
| `job` | many, at most 64 live | `requested` (initial), `passed`, `failed`, `errored`, `timed-out`, **`superseded`** | `asker`: member (fixed, required); `informed`: member (fixed, list of at most 2); `manifest`: item of type `manifest` (fixed, required); `decidedBy`: fact of kind `check`, `check-error`, `timed:job-deadline` under `change`; `name`: text, at most 128 bytes (fixed, required); `tree`: tree (fixed, required); `configuration`: digest (fixed, required); `deadline`: time (fixed, required) |  |
| `result` | many, at most 512 live | **`recorded`** (initial) | `checker`: member (fixed, required); `job`: item of type `job` (fixed, required); `outcome`: enum: `passed`, `failed`, `error` (fixed, required); `reason`: text, at most 4096 bytes (fixed); `tree`: tree (fixed, required); `details`: digest (fixed) |  |
| `thread` | many, at most 1000 live | `open` (initial), `resolved` | `opener`: member (fixed, required); `manifest`: item of type `manifest` (fixed, required); `path`: text, at most 4096 bytes (fixed, required); `line`: int, 1 to 1000000000 (fixed); `side`: enum: `base`, `change` (fixed) |  |
| `comment` | many, at most 5000 live | `visible` (initial), `collapsed`, **`redacted`** | `author`: member (fixed, required); `mentioned`: member (fixed, list of at most 16); `replyTo`: item of type `comment`; `thread`: item of type `thread` (fixed); `body`: text, at most 65536 bytes, detached; `collapseReason`: text, at most 1024 bytes |  |
| `link` | many, at most 32 live | `set` (initial), `removed` | `linker`: member (fixed, required); `issue`: scope of kind `lane` (fixed, required); `how`: enum: `keyword`, `manual` (fixed, required) |  |
| `merge` | many, at most 16 live | `intended` (initial), `committed`, `unknown`, **`published`**, **`refused`**, **`aborted`** | `merger`: member (fixed, required); `manifest`: item of type `manifest` (fixed, required); `commit`: commit; `reason`: text, at most 1024 bytes; `withdrawal`: enum: `asked` |  |
| `rules` | one | `current` (initial) | `source`: fact of kind `publish`, `rules-wanted` under `platform:rules`; `approvals`: int, 0 to 64 (required); `checks`: list of at most 32, each a record of `name` (text, at most 128 bytes), `configuration` (digest), `required` (bool), `checker` (member); `ownerMayReview`: bool (required); `revision`: int, 0 to 1000000000 (required); `extents`: list of at most 8, each a record of `name` (text, at most 64 bytes), `approvals` (int, 0 to 64), `approver` (text, at most 64 bytes), `checks` (list of at most 32, each a text, at most 128 bytes), `class` (enum: `content`, `deployment`, `authority`) |  |
| `commitment` | many, at most 16 live | `offered` (initial), `accepted`, **`declined`**, **`withdrawn`**, **`cancelled`** | `requester`: member (fixed, required); `offeree`: member (fixed); `performer`: member (author); `successor`: member; `termsAt`: fact of kind `offer` under `change` (fixed, required); `terms`: text, at most 4096 bytes (fixed, required) |  |
| `hold` | many, at most 16 live | `held` (initial), **`ended`** | `holder`: member (required); `under`: item of type `commitment` (fixed, required); `extent`: text, at most 1024 bytes; `ends`: time (required); `epoch`: int, 1 to 1000000 (required) |  |
| `export` | many, at most 16 live | `authorized` (initial), **`done`**, **`refused`** | `from`: member (fixed, required); `to`: member (fixed, required); `authorizer`: member (fixed, required); `hold`: item of type `hold` (fixed, required) |  |

### Acts of `change`: 54

| Kind | Step | Grant | Other items | Fields | Settles | Guards, effects, sends, attention | Needs |
|---|---|---|---|---|---|---|---|
| `open` (genesis) | open on `proposal` | `change.open` | None | `opener`: member; `title`: text, at most 256 bytes; `body?`: text, at most 65536 bytes, detached; `destination`: scope of kind `destination`; `rules`: scope of kind `rules`; `number?`: int, 1 to 1000000000; `draft`: bool |  | 0, 7, 1, 0 |  |
| `edit-own` | transition on `proposal` | `change.edit-own` | None | `title?`: text, at most 256 bytes; `body?`: text, at most 65536 bytes, detached; `labels?`: list of at most 20, each a text, at most 64 bytes |  | 2, 3, 1, 0 |  |
| `edit-any` | transition on `proposal` | `change.edit-any` | None | `title?`: text, at most 256 bytes; `body?`: text, at most 65536 bytes, detached; `labels?`: list of at most 20, each a text, at most 64 bytes |  | 1, 3, 1, 0 |  |
| `ready-own` | transition on `proposal` | `change.edit-own` | None | None |  | 2, 1, 1, 0 |  |
| `ready-any` | transition on `proposal` | `change.edit-any` | None | None |  | 1, 1, 1, 0 |  |
| `to-draft-own` | transition on `proposal` | `change.edit-own` | None | None |  | 3, 1, 1, 0 |  |
| `to-draft-any` | transition on `proposal` | `change.edit-any` | None | None |  | 2, 1, 1, 0 |  |
| `close-own` | transition on `proposal` | `change.edit-own` | None | None |  | 3, 1, 1, 0 |  |
| `close-any` | transition on `proposal` | `change.edit-any` | None | None |  | 2, 1, 1, 0 |  |
| `reopen-own` | transition on `proposal` | `change.edit-own` | None | None |  | 2, 1, 1, 0 |  |
| `reopen-any` | transition on `proposal` | `change.edit-any` | None | None |  | 1, 1, 1, 0 |  |
| `ask-rules` | transition on `proposal` | `change.propose` | None | None |  | 0, 0, 1, 0 |  |
| `propose-manifest` | open on `manifest` | `change.propose` | `proposal`: `proposal` the one item of its type; `previous`: `manifest` by the field `previous`; `hold`: `hold` by the field `hold`; `commitment`: `commitment` through the slot `under` of `also.hold` | `previous?`: item of type `manifest`; `hold?`: item of type `hold`; `lane?`: scope of kind `lane`; `foreignHold?`: int, 0 to 1000000000; `instance`: text, at most 128 bytes; `goal?`: fact of kind `file`, `revise` under `issue`; `plan?`: fact of kind `seal-plan` under `issue`; `selected`: list of at most 32, each a record of `accepted` (fact of kind `accept-report` under `issue`), `report` (fact of kind `report` under `issue`); `decisions`: list of at most 32, each a fact of kind `resolve-concern` under `issue`; `base`: commit; `integration`: commit; `tree`: tree; `complete`: bool. Presented: `pin?`: fact of kind `hold@1:check` under `issue` |  | 24, 16, 2, 0 | `git-read@1`, `hold@1` |
| `propose-file` | open on `manifest` | `change.propose` | `proposal`: `proposal` the one item of its type | `base`: commit; `path`: text, at most 1024 bytes; `digest`: digest; `size`: int, 0 to 65536; `content`: text, at most 65536 bytes |  | 4, 7, 0, 0 |  |
| `request-review-own` | open on `review-request` | `change.edit-own` | `proposal`: `proposal` the one item of its type | `requested`: member |  | 2, 2, 0, 1 |  |
| `request-review-any` | open on `review-request` | `change.edit-any` | `proposal`: `proposal` the one item of its type | `requested`: member |  | 1, 2, 0, 1 |  |
| `withdraw-review-request-own` | transition on `review-request` | `change.edit-own` | `proposal`: `proposal` the one item of its type | None |  | 2, 1, 0, 0 |  |
| `withdraw-review-request-any` | transition on `review-request` | `change.edit-any` | `proposal`: `proposal` the one item of its type | None |  | 1, 1, 0, 0 |  |
| `review-verdict` | open on `review` | `change.review` | `manifest`: `manifest` by the field `manifest`; `earlier`: `review` by the field `earlier`; `request`: `review-request` by the field `request`; `proposal`: `proposal` the one item of its type | `manifest`: item of type `manifest`; `earlier?`: item of type `review`; `request?`: item of type `review-request`; `verdict`: enum: `approve`, `request-changes`; `body?`: text, at most 65536 bytes, detached; `extent?`: text, at most 64 bytes |  | 9, 7, 0, 1 |  |
| `withdraw-review` | transition on `review` | `change.review` | None | None |  | 3, 1, 0, 0 |  |
| `dismiss-review` | transition on `review` | `change.dismiss` | None | `reason`: text, at most 4096 bytes |  | 2, 2, 0, 0 |  |
| `request-check` | open on `job` | `change.propose` | `manifest`: `manifest` by the field `manifest`; `proposal`: `proposal` the one item of its type; `earlier`: `job` by the field `earlier`; `rules`: `rules` the one item of its type | `manifest`: item of type `manifest`; `earlier?`: item of type `job`; `name`: text, at most 128 bytes; `configuration`: digest |  | 7, 8, 0, 0 |  |
| `check` | open on `result` | `change.check` | `job`: `job` by the field `job`; `rules`: `rules` the one item of its type; `proposal`: `proposal` the one item of its type | `job`: item of type `job`; `tree`: tree; `configuration`: digest; `outcome`: enum: `passed`, `failed`; `details?`: digest | `also.job` in `requested`, `timed-out` | 4, 8, 0, 1 |  |
| `check-error` | open on `result` | `change.check` | `job`: `job` by the field `job`; `rules`: `rules` the one item of its type | `job`: item of type `job`; `tree`: tree; `configuration`: digest; `reason`: text, at most 4096 bytes; `details?`: digest | `also.job` in `requested`, `timed-out` | 4, 8, 0, 1 |  |
| `comment` | open on `comment` | `change.comment` | None | `body`: text, at most 65536 bytes, detached; `replyTo?`: item of type `comment`; `thread?`: item of type `thread`; `mentions?`: list of at most 16, each a member |  | 0, 5, 0, 1 |  |
| `open-thread` | open on `thread` | `change.comment` | `manifest`: `manifest` by the field `manifest` | `manifest`: item of type `manifest`; `path`: text, at most 4096 bytes; `line?`: int, 1 to 1000000000; `side?`: enum: `base`, `change` |  | 0, 5, 0, 0 |  |
| `resolve-thread-own` | transition on `thread` | `change.edit-own` | `proposal`: `proposal` the one item of its type | None |  | 2, 1, 0, 0 |  |
| `resolve-thread-any` | transition on `thread` | `change.edit-any` | `proposal`: `proposal` the one item of its type | None |  | 1, 1, 0, 0 |  |
| `reopen-thread-own` | transition on `thread` | `change.edit-own` | `proposal`: `proposal` the one item of its type | None |  | 2, 1, 0, 0 |  |
| `reopen-thread-any` | transition on `thread` | `change.edit-any` | `proposal`: `proposal` the one item of its type | None |  | 1, 1, 0, 0 |  |
| `link-own` | open on `link` | `change.edit-own` | `proposal`: `proposal` the one item of its type | `issue`: scope of kind `lane`; `how`: enum: `keyword`, `manual` |  | 4, 3, 1, 0 |  |
| `link-any` | open on `link` | `change.edit-any` | `proposal`: `proposal` the one item of its type | `issue`: scope of kind `lane`; `how`: enum: `keyword`, `manual` |  | 3, 3, 1, 0 |  |
| `unlink-own` | transition on `link` | `change.edit-own` | `proposal`: `proposal` the one item of its type | None |  | 4, 1, 1, 0 |  |
| `unlink-any` | transition on `link` | `change.edit-any` | `proposal`: `proposal` the one item of its type | None |  | 3, 1, 1, 0 |  |
| `merge` | open on `merge` | `change.merge` | `proposal`: `proposal` the one item of its type; `manifest`: `manifest` by the field `manifest`; `rules`: `rules` the one item of its type | `manifest`: item of type `manifest`; `reports`: list of at most 32, each a fact of kind `report` under `issue` |  | 10, 2, 1, 0 |  |
| `cancel-merge` | transition on `merge` | `change.merge` | `proposal`: `proposal` the one item of its type | None |  | 2, 1, 1, 0 |  |
| `offer` | open on `commitment` | `change.request` | `proposal`: `proposal` the one item of its type | `offeree?`: member; `terms`: text, at most 4096 bytes |  | 1, 4, 0, 1 |  |
| `accept` | transition on `commitment` | `change.promise` | None | `terms`: fact of kind `offer` under `change` |  | 3, 2, 0, 1 |  |
| `decline` | transition on `commitment` | `change.promise` | None | None |  | 2, 1, 0, 0 |  |
| `withdraw` | transition on `commitment` | `change.promise` | None | None |  | 2, 1, 0, 1 |  |
| `cancel` | transition on `commitment` | `change.request` | None | None |  | 2, 1, 0, 1 |  |
| `offer-handover` | transition on `commitment` | `change.promise` | None | `successor`: member |  | 2, 1, 0, 1 |  |
| `accept-handover` | transition on `commitment` | `change.promise` | None | `terms`: fact of kind `offer` under `change` |  | 4, 2, 0, 2 |  |
| `decline-handover` | transition on `commitment` | `change.promise` | None | None |  | 2, 1, 0, 0 |  |
| `take-hold` | open on `hold` | `change.work` | `commitment`: `commitment` by the field `commitment`; `proposal`: `proposal` the one item of its type | `commitment`: item of type `commitment`; `extent?`: text, at most 1024 bytes |  | 4, 4, 0, 0 |  |
| `edit-comment-own` | transition on `comment` | `change.comment` | None | `body`: text, at most 65536 bytes, detached |  | 2, 1, 0, 0 |  |
| `edit-comment-any` | transition on `comment` | `change.edit-any` | None | `body`: text, at most 65536 bytes, detached |  | 1, 1, 0, 0 |  |
| `collapse-comment` | transition on `comment` | `change.triage` | None | `reason`: text, at most 1024 bytes |  | 1, 2, 0, 0 |  |
| `expand-comment` | transition on `comment` | `change.triage` | None | None |  | 1, 2, 0, 0 |  |
| `redact-comment-own` | transition on `comment` | `change.comment` | None | None |  | 2, 2, 0, 0 |  |
| `redact-comment-any` | transition on `comment` | `change.edit-any` | None | None |  | 1, 2, 0, 0 |  |
| `renew-hold` | transition on `hold` | `change.work` | `commitment`: `commitment` through the slot `under` of `on` | None |  | 4, 2, 0, 0 |  |
| `release-hold` | transition on `hold` | `change.work` | None | None |  | 2, 1, 0, 0 |  |
| `authorize-export` | open on `export` | `work.export` | `hold`: `hold` by the field `hold` | `hold`: item of type `hold`; `to`: member |  | 1, 4, 0, 0 |  |

### Handlers of `change`: 4

| Name | Class and message | From | Opens | Copies | Other items | Fields | Settles | Guards, effects, sends, attention | Needs |
|---|---|---|---|---|---|---|---|---|---|
| `rules` | relate `rules` | `rules` under `platform:rules` | `rules` | 1 | `proposal`: `proposal` the one item of its type | `approvals`: int, 0 to 64; `checks?`: list of at most 32, each a record of `name` (text, at most 128 bytes), `configuration` (digest), `required` (bool), `checker` (member); `ownerMayReview`: bool; `labels?`: list of at most 32, each a text, at most 64 bytes; `singleControllerException?`: bool; `extents?`: list of at most 8, each a record of `name` (text, at most 64 bytes), `approvals` (int, 0 to 64), `approver` (text, at most 64 bytes), `checks` (list of at most 32, each a text, at most 128 bytes), `class` (enum: `content`, `deployment`, `authority`) |  | 1, 6, 0, 0 |  |
| `publication` | relate `publication` | `destination` under `platform:destination` | Nothing | 16 | `merge`: `merge` by the field `operation`; `proposal`: `proposal` the one item of its type; `manifest`: `manifest` through the slot `manifest` of `also.merge` | `operation`: fact of kind `merge` under `change`; `outcome`: enum: `committed`, `unknown`, `published`, `refused`, `aborted`; `commit?`: commit; `reason?`: text, at most 1024 bytes; `rules?`: int, 0 to 1000000000 | `also.merge` in `intended`, `committed`, `unknown` | 2, 9, 3, 0 | `hold@1` |
| `export-license` | tell `export-license` | `task` under `platform:task` | Nothing |  | `export`: `export` by the field `export`; `target`: `hold` by the field `hold` | `export`: fact of kind `authorize-export` under `change`; `checkpoint`: digest; `hold`: item of type `hold`; `instance`: text, at most 128 bytes; `k`: int, 1 to 3 |  | 5, 1, 0, 0 | `hold@1` |
| `export-settled` | tell `export-settled` | `task` under `platform:task` | Nothing |  | `export`: `export` by the field `export` | `export`: fact of kind `authorize-export` under `change`; `final`: enum: `confirmed`, `withheld` | `also.export` in `authorized` | 2, 3, 0, 0 | `hold@1` |

### Timed rules of `change`: 2

| Name | On | In states | Deadline slot | Effects, attention |
|---|---|---|---|---|
| `job-deadline` | `job` | `requested` | `deadline` | 2, 1 |
| `hold-end` | `hold` | `held` | `ends` | 1, 0 |
