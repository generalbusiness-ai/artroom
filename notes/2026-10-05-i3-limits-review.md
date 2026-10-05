# I3: the review of the parked limiter and requests code

Written 2026-10-05, with step 15 of the I3 plan
(`notes/2026-10-05-i3-implementation-plan.md`, sections 6.1 and 8). The
plan keeps the parked rate limiter "after review", and section 11.1 of the
authority note says what that review must find: "the module must not count
before a signature, and must not share one table". This note is that
review. It also covers the parked requests code, which the same step
replaces.

"The authority note" is revision 21 at `f9ec25e4`. "The contract" is the
scope contract at revision 16, `54420b41`. "The proof plan" is revision 9
at `85be9f0b`. "The dispositions" is
`notes/2026-10-05-review-dispositions.md`. Parked paths are under
`parked/room/src/`, as they were at `4f771d901`. New paths are under
`packages/`.

Both parked files were read in full before anything was written:
`ratelimit.ts`, 70 lines, and `requests.ts`, 569 lines. Neither moved as it
was. The limiter is written again against the checks below. Of the requests
code, one idea is kept, a short read-only session, and its mechanism is
replaced. Both parked files are deleted. Neither is on the plan's list of
retained paths (its section 6.2).

Nothing was run of the parked code. Each fault below is found by reading.

## 1. The limiter: `ratelimit.ts`

### 1.1 What was found

| # | Fault in the parked code | Where | Fixed by |
|---|---|---|---|
| L1 | A limit was keyed by an invitation: `limitInvitation` counted every attempt to join with an invitation under the key `inv:<id>`, ten in a minute. Anyone who knew an ID could spend its window with no key and no secret, and the invitee was then refused. This is review row M3. | `limitInvitation`, lines 67 to 70; `PER_INVITATION`, line 21 | No window, counter or limit names an invitation. The authority note defines none (section 3.6, "Authoritative use"). An invitation changes only in the commit that admits a join. |
| L2 | An attempt was counted before any signature was checked, and every attempt was counted, also one that was admitted. `redeem` called `limitAddress` after a shape check only, and admission called `limitInvitation` before its signature check (the dispositions, row M3, cite `admission.ts:237`). | `rateLimit`, lines 30 to 46; the callers in `requests.ts`, lines 242 and 259 | A join is counted only after the check that it failed, and only for a failure at check 1, 2, 3 or 6 of section 3.6. A join that is admitted counts nothing. The limit itself is read before check 1, as the note says. |
| L3 | One table held the address windows and the invitation windows. When it was full, an attempt that would open a window was refused until a window ended. A caller with many addresses, or many invitation IDs, could fill it and lock out every redemption in the room. This is review row M4. | `rateLimit`, line 40; `MAX_WINDOWS`, line 19 | One table, of address windows only. When it is full, the request is answered as its check says, a window is made for its address, and the oldest window is dropped. No request is refused for lack of a window, and a join that does not fail needs no window. |
| L4 | `limitInvitation` read the roster, `invitation(core.sql, id)`, to decide whether to count. That is a read of the room's state for a request with no checked signature and no checked secret. It also made the limit an answer about existence: an ID that reached `rate-limited` after ten attempts existed, and one that never did, did not. | `limitInvitation`, line 68 | Checks 1 and 2 are made with no state. An invitation's state is read only after the secret matched (check 7), by membership's own rules. The limiter reads no state of the scope at all. |
| L5 | The key of an address was its text. One IPv6 network is as many addresses as its holder likes, so the limit of one address was no limit for it. | `limitAddress`, lines 58 to 60 | `addressKey`: an IPv6 address is keyed by its first 64 bits, and an IPv4 address inside an IPv6 one is keyed as that IPv4 address. A value that is no address is counted nowhere. The 64 bits are I3's choice (deltas, entry ES10). |
| L6 | There was no bound on the secret checks that wait at one scope. | The whole module | The bound on waiting secret checks: a further join is answered `busy`. Only a join is counted in it. |
| L7 | A limit was reported by throwing an error with a wait time and a sentence. The caller's answer was no answer of the protocol. | `limited`, lines 26 to 27 | `rate-limited` and `busy` are `unavailable` answers of an act. The contract's `UnavailableReason` gains `rate-limited`. No wait time is stated: the note states none. |
| L8 | The window, the two limits and the size of the table were constants in the module. | Lines 18 to 21 | `LimitConfig`, with proposed values that the proof plan measures. A test passes fixture values. |

### 1.2 What is kept

| Kept as | From | What it does | The check |
|---|---|---|---|
| The table as a `Map` in the order in which windows began | `tables`, line 24; the sweep in `rateLimit`, lines 34 to 37 | The oldest window is the first key. A window that has ended is removed when its address is next looked at, and a new window for that address goes to the end. | The order is what makes "drop the oldest" one step. A window is deleted before it is made again, so a key is never in the table at an old position. |
| A window that begins at the first counted event and has a fixed length | `rateLimit`, lines 38 to 45 | A window is made at an address's first failure. It ends `windowSeconds` later, whatever happened in it. | At the bound a window has ended: `now - since >= window`. |
| In memory, one table for one scope | `tables`, a `WeakMap` by room | One `JoinLimits` in the object of one membership scope. A restart empties it. | No guard reads it, and nothing in the history depends on it (the contract's section 8.2, row 26). |
| A caller with no address | `limitAddress`, lines 58 to 60 | A caller over a service binding has no address, and nothing is counted for it. | The parked module then relied on the invitation's limit. There is none now. Checks 1 and 2 and the waiting bound still apply to such a caller. |

### 1.3 What was dropped

| Parked | Why it did not move |
|---|---|
| `limitInvitation`, `PER_INVITATION`, the `inv:` windows | L1 and L4. |
| `openWindows`, "for tests" | `JoinLimits.counts()` gives the two counts. |
| `artroomError("rate-limited", …)` with `retryAfterMs` | L7. The earlier error module is not used. |
| The dependency on `RoomCore` and on `roster.ts` | The limiter is given the address, the scope's clock reading and the scope's head, and nothing else. |

### 1.4 The review against the proof plan's row

The proof plan's row "M3 and M4 Abuse limits on a join" (key O10) is the
witness. Each of its clauses, and where it is shown:

| Clause | Shown |
|---|---|
| Many joins from one address name a real invitation, each with a junk signature: each is `bad-intent`, then that address is `rate-limited`. | Both tests of `packages/scope/test/limits.test.ts`: the limits alone, and at a real membership scope through the Worker's route. |
| During that, the invitee joins from another address with the right secret and is admitted. | The same two tests. |
| Nothing was counted against the invitation, before a signature or after. | At the real scope: the head and the invitation's state are unchanged after the refused joins. In source: no key of the table names an invitation. |
| With the table full, a failing join from a new address drops the oldest window, and the invitee's join from another new address is admitted. | The first test, case g. |
| A window that was dropped, or lost in a restart, decides nothing. | The first test: the address whose window was dropped is served again. A restart is a new `JoinLimits`: nothing is stored. |
| With the bound on waiting secret checks reached, a join is answered `busy`, the same bytes are admitted later, and an admin's revocation is admitted meanwhile. | The first test, with a stand-in for membership's judgment that the test can hold. An act that is no join is not served through the limits: `isJoin`, and the object's `submit`. At the real scope an admin's act from a limited address is admitted. A join held in flight at a real scope is not shown: nothing in a membership scope's own judgment can be held by a test. |

## 2. The requests code: `requests.ts`

### 2.1 What each part becomes

| Part | Lines | Decision of section 11 | Becomes |
|---|---|---|---|
| `request`: a signed request with a nonce and a `notAfter` | 52 to 77 | Refactor | A session request: `packages/contract/src/session.ts`, `packages/bytes/src/session.ts`, and `issueSession` in `packages/scope/src/sessions.ts`. |
| Read sessions: `reader`, `newSession`, `authenticateRead`, `authenticateHash` | 151 to 199 | Refactor | `mintSession`, `openSession`, `checkSession` and `sessionReaders`. |
| `callerOf`: a caller's role and delegation, for the tool endpoint | 201 to 227 | Delete | Nothing here. A session's token names its member and its reads. The tool endpoint is I5's. |
| `workspaceRequest`, `versionKinds`, `workspaceAuthority`: a workspace and its token | 79 to 146 | Refactor, elsewhere | The steps of `hold@1`, in `packages/derive`. Nothing of them is in step 15. |
| `redeem` for a key that the client holds | 235 to 261 | Replace | The act `join` of membership, with the serving limits of section 1. A join returns no session. |
| `redeemRoom`, `sessionGrant`, `emptyUnderV1`: redemption with keys that the room makes and holds | 263 to 461 | Delete | Nothing. Each device makes and keeps its own key. |
| `judgeBearer`, `bearerAct`, `builtBefore`, `builtFor`, `bearerRequest`: acts that the room signs for a bearer token | 463 to 569 | Delete | Nothing. There are no acts by bearer token. |

### 2.2 What was found in the parts that are refactored

| # | Fault, or difference from the adopted design | Where | In the new code |
|---|---|---|---|
| Q1 | A session was a random token whose hash the room stored in a table. Only that room could check it, so every other scope would need a call to check a reader. | `newSession`, lines 168 to 173 | A token is its claims and a MAC under the deployment's session secret. A scope checks it with no call and no table (section 3.9). The cost is stated in the code: a scope that can check a session can make one, so the secret is one boundary for every repository of the deployment (section 5.5). |
| Q2 | The caller chose a session's length, up to an hour, and a redemption gave an hour. | Lines 74 and 257 | 600 seconds, set by membership from its own clock. The caller chooses nothing. |
| Q3 | A session was bound to a room by the table that held it. Nothing in the token said which room. | `authenticateHash`, lines 181 to 199 | The token names the deployment and the membership scope with its incarnation. A scope accepts it only for the membership scope that the scope itself records, which is the one its authority reads. |
| Q4 | Each read judged the session against the roster at that moment: a revoked key, a revoked delegation or a removed member ended it at once. | `authenticateHash` | Changed by design, and not a repair: a session already issued is accepted until its end, at most 600 seconds on membership's clock plus the difference between two clocks, and no new one is issued (section 3.9, "After a revocation"). The code and the guide state the window. |
| Q5 | One clock judged everything: the room's. | Throughout | Two clocks, named: membership's writes the end time, and each reading scope compares it with its own. A scope whose clock reads earlier than its previous entry's time answers `clock-behind` (section 3.12, W6). |
| Q6 | A session could stand on a delegation, and was given with a join. | `reader`, lines 151 to 166; `redeem`, line 257 | Delegations are deleted (section 3.4). A session is issued only on a request that the device's own key signed. |
| Q7 | A signed request was single use by a nonce for its key, in a table, with rows removed at their `notAfter`. Its `notAfter` could be 300 seconds ahead. Its signature was over a tag of its own. | `request`, lines 62 to 68 | Kept in substance: a session request is answered with a session once, by its key and operation identity, in a table outside the history, until its `notAfter` (the contract's section 8.2, row 24). The parked code wrote the nonce before it judged the caller, so any key could write rows. Now a row is written only after every other check, so a caller with no active key writes none, and one key holds at most 64. `notAfter` may be 900 seconds ahead, the bound of a signed request (section 3.12, W8). The bytes have their own tag, which is no tag of an intent. |
| Q8 | An invalid session and a missing one were both "unauthenticated", and the room had no state in which it accepted none. | `authenticateHash`, `fail` | A reader with no session is `forbidden`. With no secret bound, or one shorter than 32 bytes, no session is issued and none is accepted: `sessions-unavailable`, before anything else is looked at (section 5.5). |
| Q9 | Nothing refused a token in a URL. | The earlier routes | A request whose URL holds a token's form, or a query parameter with a credential's name, is refused `credential-in-url` before it is routed (section 5.3). |
| Q10 | A stream held a token's hash and judged it against the roster. Nothing here cleaned up a reader that went away. | `authenticateHash`, "what a WebSocket keeps" | `Streams`: the session is checked before every send, a reader that goes away is released at once and once, and a session's end closes a stream at its next send (section 3.9; the proof plan's key O12). |

### 2.3 What has no successor, and why that is safe to delete

| Parked | Why nothing replaces it |
|---|---|
| Bearer acts: the room signed an act for whoever held a token | Decision D2-8: there are no acts by bearer token. A session signs nothing. No function here takes a session as authority for an act: the read port alone reads it. |
| Room-held keys and room-custody redemption | Section 3.6: each device makes its own key and keeps it. The earlier room key is not carried (section 5.5). |
| Delegations, and a session's grant map | Section 3.4: deferred. No form of one exists in the contract. |
| `callerOf` | It answered a tool endpoint's question about a bearer token. I5 owns the tool endpoint. |

## 3. What this review does not show

- The numbers of the limits are proposals. The proof plan measures them.
- The caller's address is the header that the serving platform sets. That
  no caller can set it is the platform's property, and is not shown here
  (deltas, entry ES11).
- That a client's disconnect reaches the route's release call on the real
  platform is not shown: no deployment was made (deltas, entry ES7).
