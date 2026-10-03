# Declared acts stage 2: the converted tests of the declared run

Request `fd6f00b6`, condition 3; [docs/protocol.md](../docs/protocol.md) section 33.6. Written by a script from the declared run itself at code head `b0c280b9`: `npx vitest run --config vitest.workers.declared.config.ts --reporter=verbose --reporter=json` in `packages/room`. The harness ([packages/room/test/workerd/vocabulary.ts](../packages/room/test/workerd/vocabulary.ts)) logs each conversion once per test, when it applies it. A test is named by its `describe` titles and its own title, joined by ` > `.

The run passed 533 tests. 407 of them had at least one of the four conversions applied. In every room of the run the policy document is the test's own document as `artroom-policy-v2` with the code-review declarations; that is the run's premise, not a fifth conversion, and it applied in 475 tests.


## 1. Bindings: envelopes of declared kinds are `v: 2` with the active declaration's binding (R-DECL-16)

383 tests in 34 files.


### `admission.test.ts` (18 of the 26 that ran)

- R-ADM-9: a runtime failure records nothing > R-PROP-1: an Artifacts failure before admission is unavailable and records nothing
- R-ADM-9: a runtime failure records nothing > a policy engine fault during refuse is a retryable policy-runtime error; the retry is admitted
- R-GEN-1 and R-LOG-2: genesis and sealing > R-LOG-12: a new claim's opened effect does not name the lane
- R-GEN-1 and R-LOG-2: genesis and sealing > R-LOG-2, R-LOG-4: each hash is the digest of the content, chained by prev, signed by the room key
- R-ID identifiers > R-ID-1, R-ID-2: entry IDs are act_<seq>_<hash8>, and a lane's ID is its claim's ID
- R-ID identifiers > R-ID-8: operation IDs come from sequence numbers
- R-IDEM idempotency > R-IDEM-1: keys are scoped to the signing key
- R-IDEM idempotency > R-IDEM-2: a byte-identical replay returns the original record and creates no entry
- R-IDEM idempotency > R-IDEM-3: the same key with different bytes is refused idempotency-mismatch, naming the original, recording nothing
- R-IDEM idempotency > R-IDEM-4: an unrecorded refusal leaves no idempotency record; a retry is judged afresh
- R-SEC secret scanning before recording > R-SEC-1 to R-SEC-3: a token in a note is refused secret-detected, unrecorded, without repeating the secret
- R-SEC secret scanning before recording > R-SEC-1: a long random token is refused by the entropy check; a commit SHA in text is not
- R-SIG and R-ADM-1 steps 1 and 2: failures are thrown and record nothing > R-PATH-1: an invalid glob is refused glob-invalid and not recorded
- R-SIG and R-ADM-1 steps 1 and 2: failures are thrown and record nothing > R-SIG-1: a signature under another domain tag does not verify
- R-SIG and R-ADM-1 steps 1 and 2: failures are thrown and record nothing > R-SIG-4: an unknown envelope field is bad-request; an unknown body field is an unrecorded invalid-body
- R-SIG and R-ADM-1 steps 1 and 2: failures are thrown and record nothing > R-SIG-5: a bad signature is unauthenticated
- R-SIG and R-ADM-1 steps 1 and 2: failures are thrown and record nothing > R-SIG-5: an envelope for another room is unauthenticated
- R-SIG and R-ADM-1 steps 1 and 2: failures are thrown and record nothing > R-SIG-6: an envelope over 64 KiB is payload-too-large; a body field over its limit is body-too-large

### `amendment-66d6fb14.test.ts` (3 of the 3 that ran)

- amendment 66d6fb14: refuse rules run before the claim check on propose > a proposal adding .jjconflict-side-0/ outside its claim is refused with jj-conflicts, from the default policy pack, not outside-claim
- amendment 66d6fb14: refuse rules run before the claim check on propose > under the pack, a path outside the claim with no jj conflict data is still outside-claim, and a proposal inside it is admitted
- amendment 66d6fb14: refuse rules run before the claim check on propose > without the rule, the same proposal is refused by the claim check

### `amendment2.test.ts` (6 of the 8 that ran)

- R-API-8: the RPC subscription carries bytes > section 23, RPC subscription: UTF-8 bytes, one JSON Update per line
- edit 10: obligations-recomputed (R-POL-9) > section 23, Recompute after activation: reopened 0 at activation; land refused until the event lists the new obligation; a failing require gives blocked
- edit 11: land-evaluated (R-LAND-4) > section 23, Land rules in preparation: a land-evaluated event for a pass, and for a block followed by failed
- edit 12: a queued notify keeps its policy version (R-LOG-13) > section 23, Notify across an activation: the notified decisions name V1 and were made with V1
- edit 6: bearerAct and bearerRequest on the Worker's RoomWire (R-CRED-10) > section 23, Bearer receipt after revocation: a retry returns the original; after revocation it is unauthenticated and records nothing; a kept signed envelope still returns its original
- edit 8: attention pages carry publishedThrough (R-API-9) > the page's publishedThrough comes from the same read

### `amendment3.test.ts` (19 of the 19 that ran)

- R-CARRY-13: every check carry judgment is a sealed check-carried event > R-CARRY-13 a carry rule for checks refuses it: a notCarried event, policy-rejected, with the decision; and a new job is issued for I2
- R-CARRY-13: every check carry judgment is a sealed check-carried event > R-CARRY-13 a policy activation after the carry: it stops counting, and the next judgment is a new event under the new version
- R-CARRY-13: every check carry judgment is a sealed check-carried event > R-CARRY-13 check carried: a carry rule allows it; one carried event, snapshot-identical, with the rule's decision; the carry counts with that event
- R-CARRY-13: every check carry judgment is a sealed check-carried event > R-CARRY-13 fail closed: a stored carry without its sealed event never counts
- R-CARRY-14: the runner environment is the configuration's pin > R-CARRY-14 no runner pinned: the check meets the obligation on its own integration, but never carries (runner-changed)
- R-CARRY-14: the runner environment is the configuration's pin > R-CARRY-14 the configuration pins R; a check stating S is check-binding; one stating R is admitted
- R-CARRY-14: the runner environment is the configuration's pin > R-CARRY-14 the pin changes from R to S by an approved change; a check made under R is judged against the current pin and does not carry
- R-CARRY-15: a filtered job only for the recorded commit (R-CARRY-16 is in snapshot-repos.test.ts) > R-CARRY-15 the publisher writes the snapshot with another identity: its ID differs and no job is issued; once it writes the recorded commit, the job is issued for it
- R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding > R-EXEC-10 the job's volatile is the configuration's (false); a check that says otherwise is check-binding, and one that agrees is admitted
- R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding > R-EXEC-10 the job's volatile is the configuration's (true); a check that says otherwise is check-binding, and one that agrees is admitted
- R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding > R-EXEC-8 a job is not issued once its landing has ended
- R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding > R-EXEC-8 a job is not issued once its obligation is met on the integration
- R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding > R-EXEC-8 no service binding for the checker: no job is owed, and the landing waits for a check
- R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding > R-EXEC-8, R-EXEC-9, R-EXEC-10 a whole-tree job carries base, volatile, advisory, runner and a GitAuthEnv with a read token for the canonical repository, revoked after the answer
- R-OBL-7: advisory obligations never block a landing > R-OBL-7 an advisory check that arrives between readiness and reservation changes nothing reservation compares
- R-OBL-7: advisory obligations never block a landing > R-OBL-7 an advisory checker's check fails on the landing's integration: the landing proceeds, the failing check is recorded, and obligation-open is never raised for it
- R-OBL-7: advisory obligations never block a landing > R-OBL-7 the obligation is advisory by its configuration; the landing does not wait for it, and its job is still issued
- R-OBL-7: advisory obligations never block a landing > R-OBL-7, R-POL-9 an activation that makes the checker advisory recomputes the obligation as advisory, and the waiting landing proceeds
- R-OBL-7: advisory obligations never block a landing > R-OBL-7, R-REV-3 a landing does not rely on advisory evidence: the advisory checker's key compromised before reservation reopens the obligation but does not stop the landing

### `concurrency.test.ts` (5 of the 5 that ran)

- concurrent admission > R-ADM-6: when the landing engine writes while an admission awaits policy, the admission decides again before it commits
- concurrent admission > R-IDEM-2: twenty concurrent byte-identical submissions create one entry and return the same record
- concurrent admission > R-LANE-4: concurrent proposes on one generation: exactly one is admitted, the rest are recorded generation-moved
- concurrent admission > R-LANE-6: after a take-over, the old holder's concurrent acts are fenced
- concurrent admission > R-LOG-1, R-ADM-6: 60 parallel acts from six members get unique, gapless sequence numbers and one hash chain

### `followup-c9cd4cd8.test.ts` (1 of the 1 that ran)

- follow-up c9cd4cd8 (2): a fresh object schedules workspace debt it finds > a released workspace whose token revocation and inventory are owed, with no alarm stored: the fresh object stores one, and its alarm settles the debt

### `fork-token-02836f9a.test.ts` (8 of the 8 that ran)

- mint lane F: the fork read token through the fork's own ledger, in the Room > R1 lost answer: the fork's create applies and its answer is lost; pinning fails, one unknown record on the fork's ledger (none on the canonical one), kept across a restart and two alarms past the lifetime, watched, and the applied token is never revoked
- mint lane F: the fork read token through the fork's own ledger, in the Room > R2 failed revoke: the fork token's revocation after the pin fails; the record is owed by its ID with safe metadata, and a later alarm revokes it by that ID; its lifetime is 600 s
- mint lane F: the fork read token through the fork's own ledger, in the Room > R3 restart while the fork token is held: storage has an alarm no later than the fork ledger's takeover time; after the object is aborted, the fresh object schedules the debt 1 s ahead with no request, and its alarm revokes the token by its ID
- mint lane F: the fork read token through the fork's own ledger, in the Room > R4 late apply across a crash: the fork's create is held, the object is aborted, and the create applies late with no answer; through alarms alone the fresh object keeps the record unknown, observes the fork, and never revokes the late token
- mint lane F: the fork read token through the fork's own ledger, in the Room > R5 a wake-up that cannot be stored sends no fork create: pinning fails, no record is left, and the fork is not asked for a token
- mint lane F: the fork read token through the fork's own ledger, in the Room > R6 idle: the forkTokens step, the ledger's next due time and the Room's next alarm write nothing, with no records, and with an unknown record whose observation is not yet due (a write spy on this object's SQL)
- mint lane F: the fork read token through the fork's own ledger, in the Room > R7 the forkTokens step is its own kind of loop work: a failure of the step takes that kind's backoff; an earlier alarm for other work skips it and keeps the backoff; the ledger's next time waits for it; then it runs, revokes, and clears it
- mint lane F: the fork read token through the fork's own ledger, in the Room > R8 (checker C4) Artifacts stamps both of pinning's tokens 67 ms ahead of the Room's clock (request df6ff8d3): the fork read token and the canonical write token are both used, the propose is admitted with its head pinned, and no record is left in either ledger

### `founding.test.ts` (1 of the 16 that ran)

- R-PUB-10: one publisher per repository > a room that the registry does not bind to its repository publishes nothing and drives no landing

### `http.test.ts` (3 of the 4 that ran)

- HTTPS routes > POST /acts: 200 with the record, 409 with a refusal, 401 for a bad signature, 400 for duplicate keys
- HTTPS routes > reads need a session or bearer token; GET lanes, lane, proposal, ops, attention, log, explain and members
- HTTPS routes > the RPC entrypoint: room(id) returns a RoomWire whose refusals are values and failures are thrown

### `idle-writes-3da1d82b.test.ts` (16 of the 16 that ran)

- request 3da1d82b, checker controls (review of 12227d41): every failure before the work backs off, and each step keeps its own backoff > a failed pin keeps its backoff when a check job's deadline fires the alarm first
- request 3da1d82b, checker controls (review of 12227d41): every failure before the work backs off, and each step keeps its own backoff > a failed pin keeps its backoff when a lease expiry fires the alarm 1 s later: pinRef is not retried, the lease expires, and the next alarm is the pin's
- request 3da1d82b, checker controls (review of 12227d41): every failure before the work backs off, and each step keeps its own backoff > a failed pin keeps its backoff when a notification retry fires the alarm first
- request 3da1d82b, checker controls (review of 12227d41): every failure before the work backs off, and each step keeps its own backoff > landing on a cold instance whose registry answers not bound: fails closed and backs off, instead of asking for the alarm at once
- request 3da1d82b, checker controls (review of 12227d41): every failure before the work backs off, and each step keeps its own backoff > landing on a cold instance whose registry throws: fails closed and backs off, instead of asking for the alarm at once
- request 3da1d82b, checker controls (review of 12227d41): every failure before the work backs off, and each step keeps its own backoff > publication on a cold instance whose registry answers not bound: fails closed, backs off 5, 10, 20, 40, 80 s, and is not logged
- request 3da1d82b, checker controls (review of 12227d41): every failure before the work backs off, and each step keeps its own backoff > publication on a cold instance whose registry throws: fails closed, backs off 5, 10, 20, 40, 80 s, and is logged
- request 3da1d82b, checker controls (review of 12227d41): every failure before the work backs off, and each step keeps its own backoff > workspace setup waits, kept, while the canonical repository is gone
- request 3da1d82b: a room whose canonical repository is gone > a later act tries once more, still with one admin item; a forced publication also tries; neither reschedules
- request 3da1d82b: a room whose canonical repository is gone > if the repository comes back, a forced publication confirms the kept cohort, the admin item closes, and landing is scheduled again
- request 3da1d82b: a room whose canonical repository is gone > stops rescheduling work that cannot succeed, surfaces exactly one admin item, and keeps the unknown cohort and the owed revocation
- request 3da1d82b: an idle room writes nothing > a checkpoint-only unpublished suffix is never due; a real act after it is due a minute later and is published, and then the room is idle again
- request 3da1d82b: an idle room writes nothing > after the last act's publication settles, a founded idle room writes no rows and stores no alarm over 24 simulated hours of alarm ticks
- request 3da1d82b: failing work backs off > a failing publication backs off from 5 s, doubling, to a 5-minute cap: never closer than the backoff allows, and at most 12 retries in every hour after the first
- request 3da1d82b: failing work backs off > a failing step on the 5-second loop (a pin) backs off to the cap, and the backoff resets once it succeeds
- request 3da1d82b: failing work backs off > a publication the registry does not allow (R-PUB-10) backs off the same way

### `job-token-mint.test.ts` (13 of the 13 that ran)

- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > a refusal that changed nothing settles the mint at once
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > an answer still outstanding: the mint stays recorded, nothing is sent; when it comes after the deadline, the token is ended and the record settled
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > an answer without token text: nothing is sent; the token is owed by its ID and revoked
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > an inventory that is incomplete is noted as such; a live token the Room knows is not counted
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > applied, then the answer lost: nothing is sent; the next attempt is sent; the record stays open, visible, past the deadline and after the token has expired, with what each inventory saw
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > review 013dad0c: the mint is held past its deadline, a second jobs step sends the next attempt, then the mint applies with a lost answer
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > review 013dad0c: the mint is held past its deadline, a second jobs step sends the next attempt, then the mint applies with a usable answer
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > review 013dad0c: the mint is held past its deadline, a second jobs step sends the next attempt, then the mint applies with a usable, minted in time answer
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > the observations back off, to at most six hours, and never stop
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > the room stops while a mint's answer is outstanding: the record survives as an unknown one, and the next attempt goes on
- follow-up c9cd4cd8: an unknown mint's observation > (2) with no alarm stored, a fresh object stores one, and its alarm observes the unknown mint without settling it
- follow-up c9cd4cd8: an unknown mint's observation > (3) an inventory with a record of an unknown scope is noted as incomplete, never counted; the unknown mint stays open
- follow-up c9cd4cd8: an unknown mint's observation > (3) an inventory with a record whose expiry is not a timestamp string is noted as incomplete, never counted; the unknown mint stays open

### `landing.test.ts` (13 of the 16 that ran)

- R-ADMIN configuration recovery and sole-admin approval > section 23, Policy lockout: the sole admin repairs the policy through a configuration-recovery lane; policy-activated follows
- R-ADMIN configuration recovery and sole-admin approval > section 23, Sole admin changes policy (R-ADMIN-2): the flagged self-approval lands; if a second admin joins before reservation, it stops counting
- R-LAND-6 and R-LAND-9: changes before reservation invalidate the operation > section 23, a new generation during preparation: retryable, reason generation-moved
- R-LAND-6 and R-LAND-9: changes before reservation invalidate the operation > section 23, a policy activation during preparation: the operation re-prepares under the new version and still lands (R-POL-9, R-LAND-5)
- R-LAND-6 and R-LAND-9: changes before reservation invalidate the operation > section 23, a release during preparation: retryable, reason released
- R-LAND-8 and R-REV-7: acts admitted while a reservation is held > R-LAND-7: reservation re-judges the initiator's authority; a removed initiator's landing is retryable authority-lost
- R-LAND-8 and R-REV-7: acts admitted while a reservation is held > R-REV-5: with no push that can still land, the abort attempt ends in aborted and frees the slot
- R-LAND-8 and R-REV-7: acts admitted while a reservation is held > section 23, Paused push; compromised revocation of evidence (R-REV-5, R-REV-6): an abort attempt is recorded; the push lands; a revert lane opens
- R-LAND-8 and R-REV-7: acts admitted while a reservation is held > section 23, Paused push; release, new generation, objection, retired revocation: each admitted with after; the landing completes
- R-POL-6, R-LAND-4, R-LAND-7: the stage-specific land rule > R-POL-7: under the default policy an objection blocks landing (objection-open)
- R-POL-6, R-LAND-4, R-LAND-7: the stage-specific land rule > section 23, Stage-specific land rule and Byte mismatch: a new objection between ready and reservation changes the bytes; retryable with land-input-changed
- R-POL-6, R-LAND-4, R-LAND-7: the stage-specific land rule > section 23, Stage-specific land rule: a rule blocking stage reservation admits the land act but fails preparation, never ready
- R-POL-6, R-LAND-4, R-LAND-7: the stage-specific land rule > section 23, Stage-specific land rule: unchanged state rebuilds byte-equal input and lands

### `lanes.test.ts` (19 of the 19 that ran)

- R-LANE lanes and leases > R-ADM-11, R-LANE-5: an accepted holder act renews the lease; a recorded refusal does not
- R-LANE lanes and leases > R-LANE-1: a claim opens a lane at generation 0 and lease generation 1, held by the signer
- R-LANE lanes and leases > R-LANE-2: the holder rescopes with lease and expectedGeneration; a stale expectedGeneration is generation-moved
- R-LANE lanes and leases > R-LANE-3: only the holder may propose, release or renew; others are refused not-holder
- R-LANE lanes and leases > R-LANE-6: an old lease generation is fenced; R-LANE-7: take-over of a held lane is lane-held
- R-LANE lanes and leases > R-LANE-8 and R-LANE-6: the alarm expires the lease, records lease-expired, and fences the old holder
- R-LANE lanes and leases > R-LANE-8: a release keeps the handover note and leaves the lane unheld
- R-LANE lanes and leases > R-PATH-3: overlaps with held lanes are reported, conservatively, with certain for literal paths
- R-PROP proposals > R-ADMIN-1: a change under .artroom/** gets obl_admin-approval; R-OBL-2: a non-admin cannot meet it
- R-PROP proposals > R-POL-1: a proposal whose head has an invalid policy file is policy-invalid
- R-PROP proposals > R-PROP-1, R-PROP-2: propose pins the head; generation n+1; obligations from actual changed paths (R-PROP-5)
- R-PROP proposals > R-PROP-1: a head not in the lane's fork is head-unknown, recorded
- R-PROP proposals > R-PROP-4: a changed path outside the claim is outside-claim, with the fix to extend the claim
- R-PROP proposals > R-PROP-6: a diff over the bound is refused, recorded, with diff-too-large
- R-WS workspace credentials > R-WS-2: a token before the workspace is ready is workspace-not-ready
- R-WS workspace credentials > R-WS-3: each lease generation's token is revoked when the lease ends
- R-WS workspace credentials > section 23, A requests the token with an old lease generation; after its key is revoked; after it is removed; under an expired delegation (R-WS-2)
- R-WS workspace credentials > section 23, A token appears in no attention item, update, log entry, explain, error or cached response (R-WS-4)
- R-WS workspace credentials > section 23, B watches A's workspace (R-WS-1, R-WS-2): B sees state, remote and lease generation, no token; B's token request is not-holder

### `live-propose-df6ff8d3.test.ts` (2 of the 2 that ran)

- request df6ff8d3: a propose with Artifacts' clock ahead of the Room's > 67 ms ahead, as live: two proposes are admitted, both lanes land, the log publishes, and no canonical token is left active or owed
- request df6ff8d3: a propose with Artifacts' clock ahead of the Room's > an expiry a minute past the lifetime asked is still refused: the propose is unavailable and its token is owed revocation

### `log.test.ts` (11 of the 11 that ran)

- R-API reads, cursors and explain > R-API-5: wait times out with timeout when the operation does not reach the state
- R-API reads, cursors and explain > R-API-6, R-API-7: log pages ascend, always carry a cursor, and resume exactly after the last item
- R-API reads, cursors and explain > explain shows the entry, its decisions, the platform invariants and whether it is published
- R-API-8 live updates > HTTPS long poll: an empty update after waitMs; a new entry wakes it; R-LOG-11 states publishedThrough
- R-API-8 live updates > R-API-12: ?cursor= resumes from that cursor
- R-API-8 live updates > RPC subscribe: a stream of updates as newline-delimited JSON
- R-API-8 live updates > attention pages carry a cursor and resume
- R-API-8 live updates > section 23, WebSocket (R-API-12): token as a subprotocol, judged before the upgrade; 101 with artroom.v1 only; 401 without a token; 1008 after revocation
- section 23, Log construction (R-LOG-2, R-LOG-8, R-LOG-12, R-LOG-13) > R-LOG-7, R-EVAL-8: every decision's replay context is retained and published under its digest
- section 23, Log construction (R-LOG-2, R-LOG-8, R-LOG-12, R-LOG-13) > R-POL-5: a notified member sees the item in attention with the rule's why
- section 23, Log construction (R-LOG-2, R-LOG-8, R-LOG-12, R-LOG-13) > section 23, A notify rule hits a runtime failure (R-LOG-13): the claim stays recorded; a notified entry is sealed after a retry

### `mint-publication-78f0971c.test.ts` (7 of the 10 that ran)

- mint lane B: the publication token through the canonical mint ledger, in the Room > a backlog of 45 owed revocations, the first held unanswered, and no further request: no stored alarm under 1 s ahead or past the held attempt's timeout; a publication lands meanwhile; then alarms alone revoke every record, earliest due first, each next alarm 1 s after its pass; an earlier lease alarm is kept, and a future observation is stored on time
- mint lane B: the publication token through the canonical mint ledger, in the Room > a crash with the answer lost: the object is aborted while the create is held and the create applies late; through the alarm alone, the fresh object records it as unknown, stores a bounded alarm for the observation, observes once, and keeps the record
- mint lane B: the publication token through the canonical mint ledger, in the Room > a ledger record with a readable expiry whose revocations fail ends when that expiry passes, with no revocation recorded; a landing row for the same case stays, with plan 003's record, until tokenRevoked
- mint lane B: the publication token through the canonical mint ledger, in the Room > a wake-up that cannot be stored sends no create: the publication attempt ends with safe metadata, and lands once storage recovers
- mint lane B: the publication token through the canonical mint ledger, in the Room > an earlier alarm runs while the token is held: afterwards storage still has an alarm no later than the takeover time; after the object is aborted, the next alarm takes over and revokes the token by its ID
- mint lane B: the publication token through the canonical mint ledger, in the Room > no alarm stored beforehand: while the publication token's create is held, storage has an alarm no later than the takeover time, stored by the ledger's wake before the create was sent; a wake that takes 20 s of room time comes before the lifetime, which the record holds
- mint lane B: the publication token through the canonical mint ledger, in the Room > several alarms on a live host with a long-held token: each moves the takeover time ahead, and none stores an alarm less than 1 s ahead

### `mint-sites-5ff58c9a.test.ts` (27 of the 33 that ran)

- mint lane C (1): a lost answer at each canonical site leaves an unknown record, kept across a restart and two alarms; nothing outside the Room's records is revoked > a whole-tree check job
- mint lane C (1): a lost answer at each canonical site leaves an unknown record, kept across a restart and two alarms; nothing outside the Room's records is revoked > integrate (the landing's staging)
- mint lane C (1): a lost answer at each canonical site leaves an unknown record, kept across a restart and two alarms; nothing outside the Room's records is revoked > pinObjects (the canonical half)
- mint lane C (1): a lost answer at each canonical site leaves an unknown record, kept across a restart and two alarms; nothing outside the Room's records is revoked > pinRef
- mint lane C (1): a lost answer at each canonical site leaves an unknown record, kept across a restart and two alarms; nothing outside the Room's records is revoked > preview (a merge in the sandbox)
- mint lane C (1): a lost answer at each canonical site leaves an unknown record, kept across a restart and two alarms; nothing outside the Room's records is revoked > snapshot preparation's canonical read
- mint lane C (1): a lost answer at each canonical site leaves an unknown record, kept across a restart and two alarms; nothing outside the Room's records is revoked > the log remote's push
- mint lane C (1): a lost answer at each canonical site leaves an unknown record, kept across a restart and two alarms; nothing outside the Room's records is revoked > the log remote's readRef
- mint lane C (2): a failed revocation at each canonical site is owed, and revoked by its ID at a later alarm > a whole-tree check job
- mint lane C (2): a failed revocation at each canonical site is owed, and revoked by its ID at a later alarm > integrate (the landing's staging)
- mint lane C (2): a failed revocation at each canonical site is owed, and revoked by its ID at a later alarm > pinObjects (the canonical half)
- mint lane C (2): a failed revocation at each canonical site is owed, and revoked by its ID at a later alarm > pinRef
- mint lane C (2): a failed revocation at each canonical site is owed, and revoked by its ID at a later alarm > preview (a merge in the sandbox)
- mint lane C (2): a failed revocation at each canonical site is owed, and revoked by its ID at a later alarm > snapshot preparation's canonical read
- mint lane C (2): a failed revocation at each canonical site is owed, and revoked by its ID at a later alarm > the log remote's push
- mint lane C (2): a failed revocation at each canonical site is owed, and revoked by its ID at a later alarm > the log remote's readRef
- mint lane C (4): a check job's deadline, through issue and the production ledger > answer delay: the create applies at once and its answer is held 20 s; the expiry is by the deadline, so the token is claimed and the job sent
- mint lane C (4): a check job's deadline, through issue and the production ledger > boundary: a reported expiry equal to the deadline is accepted, and the job sent; 1 ms later is owed and never given out
- mint lane C (4): a check job's deadline, through issue and the production ledger > boundary: dispatch at a clock equal to the deadline sends no job and ends the token; 1 ms before it sends the job
- mint lane C (4): a check job's deadline, through issue and the production ledger > create delay: the create applies 20 s after it is sent and answers at once; its expiry passes the generic check but is after the deadline: no caller gets it, its ID is owed and revoked, and no job is sent
- mint lane C (4): a check job's deadline, through issue and the production ledger > wake delay: the wake-up takes 20 s of room time; the lifetime is asked after it, so the token's expiry is by the deadline, and the job is sent
- mint lane C (5): an ended job token's revocation is bounded, and its expiry is checked again before the send > a repository lookup still out when the wait ends: nothing is sent, then or when it answers; the debt stays for a later pass
- mint lane C (5): an ended job token's revocation is bounded, and its expiry is checked again before the send > a revocation that never answers ends within the wait; the row keeps its debt with backoff; its late answer changes nothing
- mint lane C (5): an ended job token's revocation is bounded, and its expiry is checked again before the send > an expiry that passes during the lookup: the row is settled, and no revocation is sent
- mint lane C (5): settlement at a known expiry > a job_tokens row whose revocation fails settles once its known expiry passes, with no revocation recorded; a job's ledger record with no readable expiry is never settled by time
- mint lane C: ended job tokens and due jobs are taken in bounded batches, earliest due first > 45 ended job tokens due at once, the first revocation held: the first pass sends at most 20, earliest due first; the alarm's later steps still run; the backlog continues 1 s after each pass, and all 45 are revoked
- mint lane C: ended job tokens and due jobs are taken in bounded batches, earliest due first > a fresh object schedules job token debt with no request: overdue rows 1 s ahead; future rows at their own time, after an earlier unrelated alarm, which is kept; its alarms alone revoke them

### `obligations.test.ts` (20 of the 21 that ran)

- Carrying through the policy port (section 23 plan cases) > .artroom/policy.json changes (R-CARRY-3, R-ADMIN-1): obl_admin-approval appears and the verdict does not carry
- Carrying through the policy port (section 23 plan cases) > Approval with dependsOn src/lib/authz/**, helper changes (R-CARRY-2, R-CARRY-5): not carried, listed with paths, obligation reopens
- Carrying through the policy port (section 23 plan cases) > No declaration and no default (R-CARRY-1, R-CARRY-11): the verdict carries, shown as carried from generation 1
- Carrying through the policy port (section 23 plan cases) > No dependsOn, room default lists src/lib/** (R-CARRY-2): not carried
- Carrying through the policy port (section 23 plan cases) > package-lock.json changes (R-CARRY-3): a global input, so the verdict does not carry
- R-OBL review obligations > R-LAND-1: land is refused obligation-open while a review obligation is open, naming it
- R-OBL review obligations > R-OBL-1: a review must name the generation's head (head-mismatch)
- R-OBL review obligations > R-OBL-1: a review of an earlier generation is recorded as history and meets nothing on the new one
- R-OBL review obligations > R-OBL-2: a reviewer who qualifies for nothing is not-authorized-reviewer; the author is self-review
- R-OBL review obligations > R-OBL-2: allowSelf takes effect only when every path is documentation
- R-OBL review obligations > R-OBL-4: count n needs n distinct members; R-OBL-6: met when enough
- R-OBL review obligations > R-OBL-5: obligations come from require rules on actual changed paths; none when no path matches
- R-OBL-3 checks > R-LAND-1: land is admitted with a check obligation open; preparation waits for the check, then lands
- R-OBL-3 checks > a check binding the preview integration, the active config digest and the tree meets the obligation
- R-OBL-3 checks > a failing required check fails the landing with check-failed
- R-OBL-3 checks > check-binding for a foreign integration, a stale config or another tree; not-authorized-checker outside `by`; role-forbids for a member
- R-REV revocation and evidence > R-REV-1: a later demotion of the reviewer does not reopen the obligation
- R-REV revocation and evidence > R-REV-2: under retiredEvidence reopens, a retired reviewer's approval stops counting
- R-REV revocation and evidence > section 23, Compromised reviewer's approval (R-REV-3): evidence stops counting, the obligation reopens, a pending landing becomes retryable
- R-REV revocation and evidence > section 23, Reviewer retired after their review (R-REV-1, R-REV-2): the review still counts and the change lands

### `phase2b.test.ts` (20 of the 21 that ran)

- abort attempts (R-REV-5) > an abort whose at-once run was lost is carried out by the alarm, beside the push still in flight
- policy activation and recompute, scoped check carry and filtered checker inputs (R-POL-9, R-CARRY-6 to 10, R-OBL-3) > a filtered input binds only the room's snapshot over the checker's inputs plus the global inputs
- policy activation and recompute, scoped check carry and filtered checker inputs (R-POL-9, R-CARRY-6 to 10, R-OBL-3) > a scoped check carries onto the new integration when main moved outside its inputs: snapshot-identical, and the landing completes
- policy activation and recompute, scoped check carry and filtered checker inputs (R-POL-9, R-CARRY-6 to 10, R-OBL-3) > a scoped check does not carry when main changed a global input (R-CARRY-8): the landing waits for a new check
- policy activation and recompute, scoped check carry and filtered checker inputs (R-POL-9, R-CARRY-6 to 10, R-OBL-3) > a whole-tree check does not carry once main moved: the tree changed
- policy activation and recompute, scoped check carry and filtered checker inputs (R-POL-9, R-CARRY-6 to 10, R-OBL-3) > an activation adding a check requirement re-prepares an unreserved landing, recomputes, and the landing waits for the check, then lands
- previews from lane B's planner (R-PROP-7) > a fast-forward previews the head itself, with no sandbox run
- previews from lane B's planner (R-PROP-7) > after main moved under them: a clean merge carries the sandbox's commit; a conflict carries its paths
- previews from lane B's planner (R-PROP-7) > disjoint paths after main moved: the sandbox's merge commit, which the landing on that main then lands exactly
- reservation-time re-validation through lane B's engine (R-LAND-7) > a reviewer's key retired between ready and reservation, under retiredEvidence: reopens: the landing is retryable evidence-invalid
- the adapters' boundaries > a log ref that cannot be read is an error, never an absent ref
- the adapters' boundaries > a repository at the lane's fork name that is not a fork of the room's repository is never read as the lane's fork
- the adapters' boundaries > an object the binding decodes differently does not hash to its ID, and is refused
- the adapters' boundaries > with a policy carry rule in force but no runner pinned, a check does not carry: it reruns (R-CARRY-14)
- unknown-outcome publication recovery (R-PUB-5, R-PUB-7) > a push that applied but whose report was lost: the read-back decides, and the landing completes with one push
- unknown-outcome publication recovery (R-PUB-5, R-PUB-7) > pushes with no answer leave the slot held, unresolved, retried on lane B's backoff; the alarm is set from the engine's next due time
- unknown-outcome publication recovery (R-PUB-5, R-PUB-7) > the instance stops while the push is in flight: after a restart, the alarm revokes the dead instance's token, reads main back and completes forward
- workspace lease races and delayed cleanup (R-WS, R-CRED-8, R-LANE-8) > Artifacts cannot revoke at release: the cleanup is owed, the alarm follows lane B's capped backoff, and the token is revoked once Artifacts answers
- workspace lease races and delayed cleanup (R-WS, R-CRED-8, R-LANE-8) > a renewal while the workspace is pending: the token ends within the renewed lease
- workspace lease races and delayed cleanup (R-WS, R-CRED-8, R-LANE-8) > a take-over while the lease token is being minted: that token is revoked, and the new holder's workspace is the only live access

### `pin-delay.test.ts` (11 of the 17 that ran)

- PIN_DELAY_MS (spike measurement only) > set, composed with lane C (main 965c911a): the delayed pin, the mint ledger, the error upgrade, the job-token pass and the check jobs each offer one due time and the earliest wins; per-kind backoff and the repository-gone fences hold
- PIN_DELAY_MS (spike measurement only) > set, composed with mint lane F (request 02836f9a): the fork token ledger is a sixth candidate; the earliest wins among the delayed pin, the mint ledger, the error upgrade, the job-token pass, the check jobs and the fork token ledger; only its own backoff holds it, and the repository-gone fence does not
- PIN_DELAY_MS (spike measurement only) > set, composed with the mint ledger and the error upgrade (main df22d771): the earliest wins; the repository-gone fence holds the pin and the ledger but not the upgrade
- PIN_DELAY_MS (spike measurement only) > set, with the mint ledger (main 574568b2): the earliest of the delayed pin and the ledger's due time wins, and each keeps its own fence and backoff
- PIN_DELAY_MS (spike measurement only) > set: a pin not yet due is not loop work (no backoff written), and when due it obeys the pins loop's backoff (request 3da1d82b)
- PIN_DELAY_MS (spike measurement only) > set: a read of the proposal still finds its pinned ref (R-PROP-1)
- PIN_DELAY_MS (spike measurement only) > set: the commit leaves the pin; the alarm wakes for it when due, not before, and cleans up its due time
- PIN_DELAY_MS (spike measurement only) > set: the delayed pin survives a restart; the fresh object's stored alarm completes it when due
- PIN_DELAY_MS (spike measurement only) > set: while the canonical repository is gone, a delayed pin is neither woken for nor written (the pins loop's fence)
- PIN_DELAY_MS (spike measurement only) > unset after a delayed pin: the fresh object writes it at once and cleans up the due time it left
- PIN_DELAY_MS (spike measurement only) > unset: the propose's own commit writes the pin, with no tick, and records no due time

### `request-c657d4ba.test.ts` (1 of the 14 that ran)

- (2) a refused join is never recorded, on any path (SEC-02, R-GEN-6, R-ADM-8) > control: other acts refused at step 9 are still recorded (R-ADM-8)

### `request-d268d249.test.ts` (32 of the 38 that ran)

- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with a JSON password: the old 503, nothing recorded, one diagnosis, the same act retried, and no credential
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with a credential in the error's name: the name is redacted too
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with a double-quoted password with an escaped quote: the old 503, nothing recorded, one diagnosis, the same act retried, and no credential
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with a double-quoted password with spaces: the old 503, nothing recorded, one diagnosis, the same act retried, and no credential
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with a one-character token pair: the old 503, nothing recorded, one diagnosis, the same act retried, and no credential
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with a private key block's body: the old 503, nothing recorded, one diagnosis, the same act retried, and no credential
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with a short Authorization header: the old 503, nothing recorded, one diagnosis, the same act retried, and no credential
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with a short Basic credential: the old 503, nothing recorded, one diagnosis, the same act retried, and no credential
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with a short Bearer credential: the old 503, nothing recorded, one diagnosis, the same act retried, and no credential
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with a short GitHub token: the old 503, nothing recorded, one diagnosis, the same act retried, and no credential
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with a short JSON Web Token: the old 503, nothing recorded, one diagnosis, the same act retried, and no credential
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with a single-quoted password with an escaped quote: the old 503, nothing recorded, one diagnosis, the same act retried, and no credential
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with the checker's quoted escaped quote: the old 503, nothing recorded, one diagnosis, the same act retried, and no credential
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with the checker's quoted spaces: the old 503, nothing recorded, one diagnosis, the same act retried, and no credential
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > pinObjects fails with the checker's short bearer: the old 503, nothing recorded, one diagnosis, the same act retried, and no credential
- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > retained job errors keep safe metadata only (request d29c09fa), at all three sinks: a lost mint, an unreadable inventory, a failed revocation (since mint lane C, the mint ledger's)
- request d268d249: each pre-admission step is logged with its name > check.snapshot: a scoped check's filtered input
- request d268d249: each pre-admission step is logged with its name > check.treeOf
- request d268d249: each pre-admission step is logged with its name > land.readMain
- request d268d249: each pre-admission step is logged with its name > land.refreshMain
- request d268d249: each pre-admission step is logged with its name > propose.changedBetween: a second generation
- request d268d249: each pre-admission step is logged with its name > propose.diff
- request d268d249: each pre-admission step is logged with its name > propose.headInFork
- request d268d249: each pre-admission step is logged with its name > propose.pinObjects
- request d268d249: each pre-admission step is logged with its name > propose.readConfig: a change under .artroom/
- request d268d249: each pre-admission step is logged with its name > propose.readMain
- request d268d249: the diagnosis is redacted and bounded > a long message is cut to 300 characters
- request d268d249: the diagnosis is redacted and bounded > a token, a URL query, userinfo and bearer credentials in the error never reach the log or the client
- request d268d249: the parallel catch-all 5xx mappings log the same way > a log publication that fails is logged with its step
- request d268d249: the parallel catch-all 5xx mappings log the same way > a preview that cannot be computed is logged; the proposal still says only that it failed
- request d268d249: the parallel catch-all 5xx mappings log the same way > a proposal read whose pinned ref cannot be written is logged with its step
- request d268d249: the parallel catch-all 5xx mappings log the same way > an RPC failure that is not an ArtroomError: internal with the fixed message, logged under the method

### `review-0f9739dc.test.ts` (11 of the 11 that ran)

- review 0f9739dc P2 1: an unanswered attempt expires at its deadline under the durable scheduler > a slow call past its deadline: the next jobs step issues a new attempt with a new token, ends the expired one, and leaves nothing past due; a late refusal of the first attempt changes nothing
- review 0f9739dc P2 1: an unanswered attempt expires at its deadline under the durable scheduler > restart: an attempt in flight when the room stops is issued again at its deadline, and its check lands the change
- review 0f9739dc P2 1: an unanswered attempt expires at its deadline under the durable scheduler > the expired attempt's wait is released by the jobs step: the room has no work left waiting on it
- review 0f9739dc P2 1: an unanswered attempt expires at its deadline under the durable scheduler > two jobs steps at once: one attempt is sent; the step that lost the claim prepares nothing (review 786e9606)
- review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8) > R-OBL-7 an advisory job still queued when its landing lands is delivered, and its check is recorded on the landed integration
- review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8) > a room the registry does not bind issues no job, and its jobs wait in the future rather than due now
- review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8) > an owed preview job whose checker configuration changed is not issued
- review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8) > an owed preview job whose lane moved to a new generation is not issued; the new generation's job is
- review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8) > an owed preview job whose preview moved to another integration is not issued
- review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8) > preview before land: the preview's job, with the preview's base and no landOp, meets the obligation, and the landing lands on it without another job
- review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8) > preview refresh after main moves: the new preview integration gets its own job, with the new base

### `review-1249097f.test.ts` (6 of the 12 that ran)

- 1. a pending cohort stored by the previous revision is upgraded with its exact commit > a cohort of an unknown version is neither published nor discarded
- 1. a pending cohort stored by the previous revision is upgraded with its exact commit > a foreign commit with the same entry lines on the ref is still another writer after the upgrade
- 1. a pending cohort stored by the previous revision is upgraded with its exact commit > a stored cohort that does not match the log is neither upgraded, published nor discarded
- 1. a pending cohort stored by the previous revision is upgraded with its exact commit > after an applied push whose answer was lost: the derived commit is the one on the ref, and recovery completes forward
- 1. a pending cohort stored by the previous revision is upgraded with its exact commit > before the push: the upgraded cohort is published on its parent, and nothing else is
- 1. a pending cohort stored by the previous revision is upgraded with its exact commit > the derived commit is stored before any further write, and survives repeated reopening

### `review-271dbd53.test.ts` (6 of the 6 that ran)

- review 271dbd53: a known token keeps a durable owner across every handoff > a late usable answer whose token outlives the deadline (the checker's first control): the job never owns it; the ledger owes it, and after a restart its alarm revokes it by its ID
- review 271dbd53: a known token keeps a durable owner across every handoff > an attempt in flight when the room restarts, then expired by the next jobs step with its cleanup write failing once: the token's record still ends it
- review 271dbd53: a known token keeps a durable owner across every handoff > normal completion (the checker's second control): the cleanup write after the answer fails once; after a restart the token is still owned, and revoked
- review 271dbd53: a known token keeps a durable owner across every handoff > the transfer fails once and the revocation fails too: the ledger's record owes it, across a restart; the token is never sent
- review 271dbd53: a known token keeps a durable owner across every handoff > the transfer itself fails once: the ledger keeps the token and revokes it by its ID; nothing is sent
- review 271dbd53: a known token keeps a durable owner across every handoff > work no longer current at dispatch: ending the prepared token fails once; the token stays owned across a restart, and is revoked

### `review-786e9606.test.ts` (12 of the 12 that ran)

- review 786e9606 P2 1: a preparation that outlives its deadline sends nothing > whole-tree: a step held past the attempt's deadline, while the next step issues attempt 2, ends its own token and sends nothing
- review 786e9606 P2 1: the step that loses the claim never ends the winner's credentials > filtered: a job token that cannot be minted leaves the job due again later; the retry reuses the repository written for it
- review 786e9606 P2 1: the step that loses the claim never ends the winner's credentials > filtered: two jobs steps at once on two owed jobs send one attempt each, whose tokens and repositories stay usable until they answer
- review 786e9606 P2 1: the step that loses the claim never ends the winner's credentials > whole-tree: two jobs steps at once on two owed jobs send one attempt each, whose tokens and repositories stay usable until they answer
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > filtered preparation, configuration changed while a read token was being minted
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > filtered preparation, generation changed while a read token was being minted
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > filtered preparation, obligation changed while a read token was being minted
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > filtered preparation, owner changed while a read token was being minted
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > whole-tree preparation, configuration changed while a read token was being minted
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > whole-tree preparation, generation changed while a read token was being minted
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > whole-tree preparation, obligation changed while a read token was being minted
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > whole-tree preparation, owner changed while a read token was being minted

### `review-8faa2ef9.test.ts` (15 of the 15 that ran)

- '*' is fixed at the grant (R-ADM-5, R-LOG-10) > a member grants '*', then is promoted to admin: the delegation still covers only a member's kinds
- 1. recovery accepts only the confirmed parent or the exact pending commit (R-LOG-8) > a foreign commit with identical entry lines but a different checkpoint is refused; nothing advances; the ref is never forced
- 1. recovery accepts only the confirmed parent or the exact pending commit (R-LOG-8) > a foreign commit with identical entry lines but a different parent is refused; nothing advances; the ref is never forced
- 1. recovery accepts only the confirmed parent or the exact pending commit (R-LOG-8) > a foreign commit with identical entry lines but a different retained is refused; nothing advances; the ref is never forced
- 1. recovery accepts only the confirmed parent or the exact pending commit (R-LOG-8) > a publisher whose confirmed commit is not the expected one is not sealed (its serialization must match commitFor)
- 1. recovery accepts only the confirmed parent or the exact pending commit (R-LOG-8) > the exact pending commit is stored before any remote write, and lost-response recovery still confirms it, across a restart
- 2. a workspace is fenced by the lease's deadline, not only its generation (R-WS-2, R-LANE-8) > a lease already past its deadline before the resume creates no fork
- 2. a workspace is fenced by the lease's deadline, not only its generation (R-WS-2, R-LANE-8) > a lease that runs out during fork creation, with no generation change, fails the op, and the expiry is sealed
- 3. attention made later at an existing head reaches issued live cursors (R-API-8) > an RPC subscription opened at the live head receives the item made later at that head
- 3. attention made later at an existing head reaches issued live cursors (R-API-8) > cursors in the earlier (seq, n) form still read, and skip nothing after their point
- 3. attention made later at an existing head reaches issued live cursors (R-API-8) > pages stay lossless: an item made later at an old seq comes after the page cursor
- 3. attention made later at an existing head reaches issued live cursors (R-API-8) > the admins' publication-unresolved item arrives on a cursor issued before it, once, and wakes a waiting poll
- 4. a review that reopens an obligation seals the reopening > Bob approves, then objects: the objection's receipt says the obligation opened
- 4. checks use the same effect calculator > @ci passes, then fails on the same input: a check only adds evidence, so the pass keeps the obligation met and the failure seals no transition
- 5. evidence stored without admission facts > a store without admission facts is judged as an author, which never adds eligibility

### `review-90f30a3b.test.ts` (8 of the 8 that ran)

- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > Artifacts answers with a token with no readable expiry: it is refused and revoked, and nothing is sent
- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > Artifacts answers with a write token: it is refused and revoked, and nothing is sent
- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > a mint delayed by less than the room's margin: the token still expires by the deadline, and the job is sent
- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > a mint delayed so that the token would outlive the deadline: the token is refused and revoked, nothing is sent, and the job is due again later
- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > an answer delayed after the mint, still before the deadline: the job is sent, with a token that expires by the deadline
- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > an answer delayed past the attempt's deadline, with no other jobs step: nothing is sent, the token is ended (it expired by the deadline, so its record is settled with no revocation), and the job is due again later
- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > cleanup fails, and the room restarts: the refused token stays owed and retried, never dropped while it can still read, until Artifacts revokes it
- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > healthy mint: the job is sent; its token reads the canonical repository, expires before the job's deadline, and is revoked after the answer

### `review-95323c2b.test.ts` (5 of the 5 that ran)

- review 95323c2b P2: a shared snapshot commit is not a reverse key to a canonical integration > a failing check on the second integration fails the second landing with check-failed
- review 95323c2b P2: a shared snapshot commit is not a reverse key to a canonical integration > carry: an earlier check on the shared snapshot commit carries to the lane's new integration, whatever order the snapshot rows are stored in
- review 95323c2b P2: a shared snapshot commit is not a reverse key to a canonical integration > fresh volatile checks on two integrations with the same snapshot commit: each is admitted, counts for its own landing's integration only, and both land
- review 95323c2b P2: a shared snapshot commit is not a reverse key to a canonical integration > without landOp, a check naming the shared snapshot commit binds the one integration this generation has
- review 95323c2b P2: a shared snapshot commit is not a reverse key to a canonical integration > wrong job or operation: another lane's land operation, an unknown operation, or another lane's integration is check-binding, and nothing is recorded

### `review-a711f7b6.test.ts` (16 of the 16 that ran)

- 1. a stored check carry counts only under the policy version that judged it > an activation with a carry rule that refuses checks: the carried check no longer counts, the obligation is open, and the landing is not reserved
- 1. a stored check carry counts only under the policy version that judged it > an activation with checks: false: the carried check no longer counts, the obligation is open, and the landing is not reserved
- 1. a stored check carry counts only under the policy version that judged it > reservation itself refuses a ready landing whose carried check stopped counting: retryable, evidence-invalid
- 1. a stored check carry counts only under the policy version that judged it > reservation requires every obligation met on the integration, even one with no evidence the landing relied on
- 1. a stored check carry counts only under the policy version that judged it > the checker configuration changed: the carried check no longer qualifies
- 1. a stored check carry counts only under the policy version that judged it > the earlier check's key compromised after the carry: the obligation is open and the landing is not reserved
- 3. a room founded before the canonical remote was stored resolves it before landing work > Artifacts is down: nothing is guessed, nothing is pushed, and the next alarm completes it
- 3. a room founded before the canonical remote was stored resolves it before landing work > a binding that answers for another repository: its remote is not used
- 3. a room founded before the canonical remote was stored resolves it before landing work > the landing completes, with the bound repository's own remote stored
- 4. check carry needs a pinned runner; the signed volatile flag must be the configuration's > a carry rule for reviews only does not stop a check carrying; one for checks is evaluated, and allows it (amendment 3 seals its decision)
- 4. check carry needs a pinned runner; the signed volatile flag must be the configuration's > a check whose volatile flag contradicts the configuration (volatile: false) is check-binding; the matching flag is admitted
- 4. check carry needs a pinned runner; the signed volatile flag must be the configuration's > a check whose volatile flag contradicts the configuration (volatile: true) is check-binding; the matching flag is admitted
- 4. check carry needs a pinned runner; the signed volatile flag must be the configuration's > no runner environment pinned for the checker: the check does not carry (R-CARRY-14), and the landing waits
- 4. check carry needs a pinned runner; the signed volatile flag must be the configuration's > the pinned runner: the check carries and the landing completes
- 4d. a scoped check binds the snapshot commit the room recorded for the integration (R-OBL-3, R-CARRY-9) > a snapshot commit with another digest, another checker's commit, or an unrecorded commit is check-binding
- 4d. a scoped check binds the snapshot commit the room recorded for the integration (R-OBL-3, R-CARRY-9) > contract-shaped CheckJob fixture: the job's integration is the recorded snapshot commit, and the check lane G signs from it is admitted and counts for the landing

### `review-aabda1ed.test.ts` (26 of the 37 that ran)

- P1.3: time-sensitive authority is judged again at the final boundary (R-ADM-6, R-ADM-4) > a delegation that expires while policy is evaluated: delegation-invalid, nothing recorded, the idempotency key not consumed
- P1.3: time-sensitive authority is judged again at the final boundary (R-ADM-6, R-ADM-4) > a lease that runs out while policy is evaluated: the expiry is sealed first, then the act is refused not-holder
- P1.3: time-sensitive authority is judged again at the final boundary (R-ADM-6, R-ADM-4) > time passing without any log change is still seen: a delegation expired before admission is refused even with no new entry
- P1.4: after a policy activation, obligations are re-judged under the new requirement (R-POL-9, R-REV-1) > a carried verdict is re-qualified under the new requirement even when carry still allows it
- P1.4: after a policy activation, obligations are re-judged under the new requirement (R-POL-9, R-REV-1) > a landing prepared before the activation cannot land on the old evidence
- P1.4: after a policy activation, obligations are re-judged under the new requirement (R-POL-9, R-REV-1) > a raised count opens it; a requirement that no longer applies to the changed paths removes it
- P1.4: after a policy activation, obligations are re-judged under the new requirement (R-POL-9, R-REV-1) > carried reviews are re-judged by carry under the new policy
- P1.4: after a policy activation, obligations are re-judged under the new requirement (R-POL-9, R-REV-1) > checker configuration: a check under the old configuration does not count under a new one
- P1.4: after a policy activation, obligations are re-judged under the new requirement (R-POL-9, R-REV-1) > owners: a requirement moved to owners the reviewer is not among is open
- P1.4: after a policy activation, obligations are re-judged under the new requirement (R-POL-9, R-REV-1) > qualification uses the role recorded at admission, not today's
- P1.4: after a policy activation, obligations are re-judged under the new requirement (R-POL-9, R-REV-1) > self-approval: an author's approval counts under allowSelf on docs, and not once allowSelf is gone
- P1.4: after a policy activation, obligations are re-judged under the new requirement (R-POL-9, R-REV-1) > the checker's case: the same requirement ID moved from @bob to @carol is open, and land is refused
- P1.5: a durable pending publication completes forward (R-LOG-8) > a lost push reply: the publisher reads back, finds its commit, and the checkpoint is sealed
- P1.5: a durable pending publication completes forward (R-LOG-8) > an unexpected writer: publication stops, publishedThrough stays, the ref is never forced, admins are told
- P1.5: a durable pending publication completes forward (R-LOG-8) > lost push and read-back replies: nothing advances; entries appended meanwhile stay out; the retry confirms the same commit
- P1.5: a durable pending publication completes forward (R-LOG-8) > restart: a new instance resumes the pending cohort before choosing another
- P2.6: pending workspaces are durable alarm work (R-WS), through lane B's Workspaces > fencing: a lease that ended before the resume is never provisioned; the old holder gets no token
- P2.6: pending workspaces are durable alarm work (R-WS), through lane B's Workspaces > fencing: a take-over while the fork is being created ends the old lease's access; the old holder gets no token
- P2.6: pending workspaces are durable alarm work (R-WS), through lane B's Workspaces > interrupted before provisioning: the alarm resumes the same op and lease, and creates one fork
- P2.6: pending workspaces are durable alarm work (R-WS), through lane B's Workspaces > the fork is created but its answer is lost: the same provision reads it back, and the fork's own token is swept
- P2.7: sealed obligation effects come from the same calculator as the projection > a repeated approval seals no met effect while two distinct members are required; the second member's does
- P2.7: sealed obligation effects come from the same calculator as the projection > an approval after the same member's objection seals met only when the latest verdicts meet it
- P2.8: attention and update cursors never skip an item (R-API-6, R-API-8) > an earlier attention cursor (seq only) still resumes after that seq
- P2.8: attention and update cursors never skip an item (R-API-6, R-API-8) > an update cursor never passes unseen attention: 120 items from one entry arrive as 100 then 20
- P2.8: attention and update cursors never skip an item (R-API-6, R-API-8) > overlapping principals: items to @bob and to role:maintainer from one entry are each delivered once
- P2.8: attention and update cursors never skip an item (R-API-6, R-API-8) > two items from one entry, read one per page, are both delivered

### `roster.test.ts` (10 of the 26 that ran)

- R-ADM-3 authority cases > (a) direct member: the receipt records via member
- R-ADM-3 authority cases > R-ADM-5: a delegation grants only kinds the grantor's role may sign; a delegated key cannot re-delegate
- R-ADM-3 authority cases > R-ADM-5: a grantor's later loss of a kind stops the delegation covering it
- R-ADM-3 authority cases > section 23, Act under an expired delegation (R-ADM-4): refused delegation-invalid, not recorded
- R-ADM-3 authority cases > section 23, Byte-identical replay after revocation (R-IDEM-2): the original record, no new entry
- R-ADM-3 authority cases > section 23, Locked-out admin restored (R-GEN-3, R-ADMIN-4): the recovery key adds a new key to the admin
- R-ADM-3 authority cases > section 23, Pre-signed act after its key's revocation (R-ADM-4): refused key-revoked, not recorded
- R-ADM-3 authority cases > section 23, Recovery key (R-ADM-3d, R-GEN-3): set-role while no admin can act; a claim by it is role-forbids
- R-ADM-3 authority cases > section 23, Unjoined Worker: a delegated key that never joined acts for the grantor; after the grantor's key is revoked, delegation-invalid (R-ADM-3b, R-CRED-4)
- R-GEN roster > R-GEN-4: a non-admin may not invite (admin-required); R-GEN-5: a checker may not claim (role-forbids)

### `safe-errors-d29c09fa.test.ts` (3 of the 9 that ran)

- request d29c09fa: rows stored with provider text before the rule, reopened > on reopen no projection shows the text, before any retry; migration 2's upgrade then rewrites every legacy error field at rest in bounded batches, terminal rows included, and stops; safe values and state stay
- request d29c09fa: the landing engine's error fields keep safe metadata only, in the Room > a failed integration (the sandbox throws, through ContainerPublisher), then readiness that cannot be computed
- request d29c09fa: the landing engine's error fields keep safe metadata only, in the Room > a push answered with the remote's text and main that cannot be read back, then a push that does not answer

### `snapshot-repos.test.ts` (9 of the 11 that ran)

- R-CARRY-16: one repository per snapshot commit > an unknown create: a repository created with no answer is found and deleted by the alarm, and the job is issued from a new repository
- R-CARRY-16: one repository per snapshot commit > older snapshot, omitted file: the newer job's repository has neither the older snapshot's commit nor the omitted file's blob, advertises only refs/artroom/snapshot at its own commit, and its token reaches nothing else
- R-CARRY-16: one repository per snapshot commit > restart: a repository whose job was in flight when the room stopped is retired after the job's deadline, and the next attempt gets a new repository
- R-CARRY-16: one repository per snapshot commit > retirement after the last job ends is a durable duty, retried until Artifacts confirms the deletion
- R-CARRY-16: one repository per snapshot commit > reuse only for the same snapshot commit: a landing's job on the preview's integration shares the in-flight preview job's repository, with its own token
- follow-up c9cd4cd8 (1): a snapshot create is sent only after its wake-up is in storage > a snapshot wake-up that cannot be stored: no create is sent, the step is closed as never sent, and the job is tried again
- follow-up c9cd4cd8 (1): a snapshot create is sent only after its wake-up is in storage > the alarm is in storage while the snapshot create is outstanding; after the host stops, a fresh object's alarm deletes the late repository
- review 1701f73e: an imported room's jobs stay in its import namespace > filtered: the job reads the import namespace through the Room's binding for it, and the public namespace is untouched
- review 1701f73e: an imported room's jobs stay in its import namespace > whole-tree: the job reads the import namespace through the Room's binding for it, and the public namespace is untouched

## 2. Recover: configuration-recovery acts are `recover` ops (R-DECL-21)

4 tests in 1 files.


### `landing.test.ts` (4 of the 16 that ran)

- R-ADMIN configuration recovery and sole-admin approval > R-ADMIN-5 is the Room's own rule: with a policy port that ignores the lane purpose, recovery-lane acts are still not judged by policy
- R-ADMIN configuration recovery and sole-admin approval > R-ADMIN-5: every act on a recovery lane needs an active admin's own key; take-over by a non-admin is admin-required
- R-ADMIN configuration recovery and sole-admin approval > section 23, Policy lockout: the sole admin repairs the policy through a configuration-recovery lane; policy-activated follows
- R-ADMIN configuration recovery and sole-admin approval > section 23, Same lockout, two admins (R-ADMIN-7): the author's own approval is self-review; the other admin's approval meets obl_admin-approval

## 3. Checker configurations are `artroom-checker-v2` and name `"act": "check"` (R-DECL-18)

127 tests in 18 files.


### `amendment2.test.ts` (1 of the 8 that ran)

- edit 9: policy-activated names the checkers (R-POL-9) > as name and digest pairs, sorted by name

### `amendment3.test.ts` (19 of the 19 that ran)

- R-CARRY-13: every check carry judgment is a sealed check-carried event > R-CARRY-13 a carry rule for checks refuses it: a notCarried event, policy-rejected, with the decision; and a new job is issued for I2
- R-CARRY-13: every check carry judgment is a sealed check-carried event > R-CARRY-13 a policy activation after the carry: it stops counting, and the next judgment is a new event under the new version
- R-CARRY-13: every check carry judgment is a sealed check-carried event > R-CARRY-13 check carried: a carry rule allows it; one carried event, snapshot-identical, with the rule's decision; the carry counts with that event
- R-CARRY-13: every check carry judgment is a sealed check-carried event > R-CARRY-13 fail closed: a stored carry without its sealed event never counts
- R-CARRY-14: the runner environment is the configuration's pin > R-CARRY-14 no runner pinned: the check meets the obligation on its own integration, but never carries (runner-changed)
- R-CARRY-14: the runner environment is the configuration's pin > R-CARRY-14 the configuration pins R; a check stating S is check-binding; one stating R is admitted
- R-CARRY-14: the runner environment is the configuration's pin > R-CARRY-14 the pin changes from R to S by an approved change; a check made under R is judged against the current pin and does not carry
- R-CARRY-15: a filtered job only for the recorded commit (R-CARRY-16 is in snapshot-repos.test.ts) > R-CARRY-15 the publisher writes the snapshot with another identity: its ID differs and no job is issued; once it writes the recorded commit, the job is issued for it
- R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding > R-EXEC-10 the job's volatile is the configuration's (false); a check that says otherwise is check-binding, and one that agrees is admitted
- R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding > R-EXEC-10 the job's volatile is the configuration's (true); a check that says otherwise is check-binding, and one that agrees is admitted
- R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding > R-EXEC-8 a job is not issued once its landing has ended
- R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding > R-EXEC-8 a job is not issued once its obligation is met on the integration
- R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding > R-EXEC-8 no service binding for the checker: no job is owed, and the landing waits for a check
- R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding > R-EXEC-8, R-EXEC-9, R-EXEC-10 a whole-tree job carries base, volatile, advisory, runner and a GitAuthEnv with a read token for the canonical repository, revoked after the answer
- R-OBL-7: advisory obligations never block a landing > R-OBL-7 an advisory check that arrives between readiness and reservation changes nothing reservation compares
- R-OBL-7: advisory obligations never block a landing > R-OBL-7 an advisory checker's check fails on the landing's integration: the landing proceeds, the failing check is recorded, and obligation-open is never raised for it
- R-OBL-7: advisory obligations never block a landing > R-OBL-7 the obligation is advisory by its configuration; the landing does not wait for it, and its job is still issued
- R-OBL-7: advisory obligations never block a landing > R-OBL-7, R-POL-9 an activation that makes the checker advisory recomputes the obligation as advisory, and the waiting landing proceeds
- R-OBL-7: advisory obligations never block a landing > R-OBL-7, R-REV-3 a landing does not rely on advisory evidence: the advisory checker's key compromised before reservation reopens the obligation but does not stop the landing

### `idle-writes-3da1d82b.test.ts` (1 of the 16 that ran)

- request 3da1d82b, checker controls (review of 12227d41): every failure before the work backs off, and each step keeps its own backoff > a failed pin keeps its backoff when a check job's deadline fires the alarm first

### `job-token-mint.test.ts` (13 of the 13 that ran)

- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > a refusal that changed nothing settles the mint at once
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > an answer still outstanding: the mint stays recorded, nothing is sent; when it comes after the deadline, the token is ended and the record settled
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > an answer without token text: nothing is sent; the token is owed by its ID and revoked
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > an inventory that is incomplete is noted as such; a live token the Room knows is not counted
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > applied, then the answer lost: nothing is sent; the next attempt is sent; the record stays open, visible, past the deadline and after the token has expired, with what each inventory saw
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > review 013dad0c: the mint is held past its deadline, a second jobs step sends the next attempt, then the mint applies with a lost answer
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > review 013dad0c: the mint is held past its deadline, a second jobs step sends the next attempt, then the mint applies with a usable answer
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > review 013dad0c: the mint is held past its deadline, a second jobs step sends the next attempt, then the mint applies with a usable, minted in time answer
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > the observations back off, to at most six hours, and never stop
- a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it > the room stops while a mint's answer is outstanding: the record survives as an unknown one, and the next attempt goes on
- follow-up c9cd4cd8: an unknown mint's observation > (2) with no alarm stored, a fresh object stores one, and its alarm observes the unknown mint without settling it
- follow-up c9cd4cd8: an unknown mint's observation > (3) an inventory with a record of an unknown scope is noted as incomplete, never counted; the unknown mint stays open
- follow-up c9cd4cd8: an unknown mint's observation > (3) an inventory with a record whose expiry is not a timestamp string is noted as incomplete, never counted; the unknown mint stays open

### `lanes.test.ts` (1 of the 19 that ran)

- R-PROP proposals > R-ADMIN-1: a change under .artroom/** gets obl_admin-approval; R-OBL-2: a non-admin cannot meet it

### `mint-sites-5ff58c9a.test.ts` (13 of the 33 that ran)

- mint lane C (1): a lost answer at each canonical site leaves an unknown record, kept across a restart and two alarms; nothing outside the Room's records is revoked > a whole-tree check job
- mint lane C (1): a lost answer at each canonical site leaves an unknown record, kept across a restart and two alarms; nothing outside the Room's records is revoked > snapshot preparation's canonical read
- mint lane C (2): a failed revocation at each canonical site is owed, and revoked by its ID at a later alarm > a whole-tree check job
- mint lane C (2): a failed revocation at each canonical site is owed, and revoked by its ID at a later alarm > snapshot preparation's canonical read
- mint lane C (4): a check job's deadline, through issue and the production ledger > answer delay: the create applies at once and its answer is held 20 s; the expiry is by the deadline, so the token is claimed and the job sent
- mint lane C (4): a check job's deadline, through issue and the production ledger > boundary: a reported expiry equal to the deadline is accepted, and the job sent; 1 ms later is owed and never given out
- mint lane C (4): a check job's deadline, through issue and the production ledger > boundary: dispatch at a clock equal to the deadline sends no job and ends the token; 1 ms before it sends the job
- mint lane C (4): a check job's deadline, through issue and the production ledger > create delay: the create applies 20 s after it is sent and answers at once; its expiry passes the generic check but is after the deadline: no caller gets it, its ID is owed and revoked, and no job is sent
- mint lane C (4): a check job's deadline, through issue and the production ledger > wake delay: the wake-up takes 20 s of room time; the lifetime is asked after it, so the token's expiry is by the deadline, and the job is sent
- mint lane C (5): an ended job token's revocation is bounded, and its expiry is checked again before the send > a repository lookup still out when the wait ends: nothing is sent, then or when it answers; the debt stays for a later pass
- mint lane C (5): an ended job token's revocation is bounded, and its expiry is checked again before the send > a revocation that never answers ends within the wait; the row keeps its debt with backoff; its late answer changes nothing
- mint lane C (5): an ended job token's revocation is bounded, and its expiry is checked again before the send > an expiry that passes during the lookup: the row is settled, and no revocation is sent
- mint lane C (5): settlement at a known expiry > a job_tokens row whose revocation fails settles once its known expiry passes, with no revocation recorded; a job's ledger record with no readable expiry is never settled by time

### `obligations.test.ts` (4 of the 21 that ran)

- R-OBL-3 checks > R-LAND-1: land is admitted with a check obligation open; preparation waits for the check, then lands
- R-OBL-3 checks > a check binding the preview integration, the active config digest and the tree meets the obligation
- R-OBL-3 checks > a failing required check fails the landing with check-failed
- R-OBL-3 checks > check-binding for a foreign integration, a stale config or another tree; not-authorized-checker outside `by`; role-forbids for a member

### `phase2b.test.ts` (6 of the 21 that ran)

- policy activation and recompute, scoped check carry and filtered checker inputs (R-POL-9, R-CARRY-6 to 10, R-OBL-3) > a filtered input binds only the room's snapshot over the checker's inputs plus the global inputs
- policy activation and recompute, scoped check carry and filtered checker inputs (R-POL-9, R-CARRY-6 to 10, R-OBL-3) > a scoped check carries onto the new integration when main moved outside its inputs: snapshot-identical, and the landing completes
- policy activation and recompute, scoped check carry and filtered checker inputs (R-POL-9, R-CARRY-6 to 10, R-OBL-3) > a scoped check does not carry when main changed a global input (R-CARRY-8): the landing waits for a new check
- policy activation and recompute, scoped check carry and filtered checker inputs (R-POL-9, R-CARRY-6 to 10, R-OBL-3) > a whole-tree check does not carry once main moved: the tree changed
- policy activation and recompute, scoped check carry and filtered checker inputs (R-POL-9, R-CARRY-6 to 10, R-OBL-3) > an activation adding a check requirement re-prepares an unreserved landing, recomputes, and the landing waits for the check, then lands
- the adapters' boundaries > with a policy carry rule in force but no runner pinned, a check does not carry: it reruns (R-CARRY-14)

### `request-d268d249.test.ts` (1 of the 38 that ran)

- request d268d249: credentials known by their syntax are redacted whatever their length (checker, 0e058f13) > retained job errors keep safe metadata only (request d29c09fa), at all three sinks: a lost mint, an unreadable inventory, a failed revocation (since mint lane C, the mint ledger's)

### `review-0f9739dc.test.ts` (11 of the 11 that ran)

- review 0f9739dc P2 1: an unanswered attempt expires at its deadline under the durable scheduler > a slow call past its deadline: the next jobs step issues a new attempt with a new token, ends the expired one, and leaves nothing past due; a late refusal of the first attempt changes nothing
- review 0f9739dc P2 1: an unanswered attempt expires at its deadline under the durable scheduler > restart: an attempt in flight when the room stops is issued again at its deadline, and its check lands the change
- review 0f9739dc P2 1: an unanswered attempt expires at its deadline under the durable scheduler > the expired attempt's wait is released by the jobs step: the room has no work left waiting on it
- review 0f9739dc P2 1: an unanswered attempt expires at its deadline under the durable scheduler > two jobs steps at once: one attempt is sent; the step that lost the claim prepares nothing (review 786e9606)
- review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8) > R-OBL-7 an advisory job still queued when its landing lands is delivered, and its check is recorded on the landed integration
- review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8) > a room the registry does not bind issues no job, and its jobs wait in the future rather than due now
- review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8) > an owed preview job whose checker configuration changed is not issued
- review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8) > an owed preview job whose lane moved to a new generation is not issued; the new generation's job is
- review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8) > an owed preview job whose preview moved to another integration is not issued
- review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8) > preview before land: the preview's job, with the preview's base and no landOp, meets the obligation, and the landing lands on it without another job
- review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8) > preview refresh after main moves: the new preview integration gets its own job, with the new base

### `review-271dbd53.test.ts` (6 of the 6 that ran)

- review 271dbd53: a known token keeps a durable owner across every handoff > a late usable answer whose token outlives the deadline (the checker's first control): the job never owns it; the ledger owes it, and after a restart its alarm revokes it by its ID
- review 271dbd53: a known token keeps a durable owner across every handoff > an attempt in flight when the room restarts, then expired by the next jobs step with its cleanup write failing once: the token's record still ends it
- review 271dbd53: a known token keeps a durable owner across every handoff > normal completion (the checker's second control): the cleanup write after the answer fails once; after a restart the token is still owned, and revoked
- review 271dbd53: a known token keeps a durable owner across every handoff > the transfer fails once and the revocation fails too: the ledger's record owes it, across a restart; the token is never sent
- review 271dbd53: a known token keeps a durable owner across every handoff > the transfer itself fails once: the ledger keeps the token and revokes it by its ID; nothing is sent
- review 271dbd53: a known token keeps a durable owner across every handoff > work no longer current at dispatch: ending the prepared token fails once; the token stays owned across a restart, and is revoked

### `review-786e9606.test.ts` (12 of the 12 that ran)

- review 786e9606 P2 1: a preparation that outlives its deadline sends nothing > whole-tree: a step held past the attempt's deadline, while the next step issues attempt 2, ends its own token and sends nothing
- review 786e9606 P2 1: the step that loses the claim never ends the winner's credentials > filtered: a job token that cannot be minted leaves the job due again later; the retry reuses the repository written for it
- review 786e9606 P2 1: the step that loses the claim never ends the winner's credentials > filtered: two jobs steps at once on two owed jobs send one attempt each, whose tokens and repositories stay usable until they answer
- review 786e9606 P2 1: the step that loses the claim never ends the winner's credentials > whole-tree: two jobs steps at once on two owed jobs send one attempt each, whose tokens and repositories stay usable until they answer
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > filtered preparation, configuration changed while a read token was being minted
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > filtered preparation, generation changed while a read token was being minted
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > filtered preparation, obligation changed while a read token was being minted
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > filtered preparation, owner changed while a read token was being minted
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > whole-tree preparation, configuration changed while a read token was being minted
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > whole-tree preparation, generation changed while a read token was being minted
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > whole-tree preparation, obligation changed while a read token was being minted
- review 786e9606 P2 2: work that changed while its credentials were prepared is not sent, and its credentials are retired > whole-tree preparation, owner changed while a read token was being minted

### `review-8faa2ef9.test.ts` (1 of the 15 that ran)

- 4. checks use the same effect calculator > @ci passes, then fails on the same input: a check only adds evidence, so the pass keeps the obligation met and the failure seals no transition

### `review-90f30a3b.test.ts` (8 of the 8 that ran)

- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > Artifacts answers with a token with no readable expiry: it is refused and revoked, and nothing is sent
- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > Artifacts answers with a write token: it is refused and revoked, and nothing is sent
- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > a mint delayed by less than the room's margin: the token still expires by the deadline, and the job is sent
- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > a mint delayed so that the token would outlive the deadline: the token is refused and revoked, nothing is sent, and the job is due again later
- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > an answer delayed after the mint, still before the deadline: the job is sent, with a token that expires by the deadline
- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > an answer delayed past the attempt's deadline, with no other jobs step: nothing is sent, the token is ended (it expired by the deadline, so its record is settled with no revocation), and the job is due again later
- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > cleanup fails, and the room restarts: the refused token stays owed and retried, never dropped while it can still read, until Artifacts revokes it
- review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent > healthy mint: the job is sent; its token reads the canonical repository, expires before the job's deadline, and is revoked after the answer

### `review-95323c2b.test.ts` (5 of the 5 that ran)

- review 95323c2b P2: a shared snapshot commit is not a reverse key to a canonical integration > a failing check on the second integration fails the second landing with check-failed
- review 95323c2b P2: a shared snapshot commit is not a reverse key to a canonical integration > carry: an earlier check on the shared snapshot commit carries to the lane's new integration, whatever order the snapshot rows are stored in
- review 95323c2b P2: a shared snapshot commit is not a reverse key to a canonical integration > fresh volatile checks on two integrations with the same snapshot commit: each is admitted, counts for its own landing's integration only, and both land
- review 95323c2b P2: a shared snapshot commit is not a reverse key to a canonical integration > without landOp, a check naming the shared snapshot commit binds the one integration this generation has
- review 95323c2b P2: a shared snapshot commit is not a reverse key to a canonical integration > wrong job or operation: another lane's land operation, an unknown operation, or another lane's integration is check-binding, and nothing is recorded

### `review-a711f7b6.test.ts` (13 of the 16 that ran)

- 1. a stored check carry counts only under the policy version that judged it > an activation with a carry rule that refuses checks: the carried check no longer counts, the obligation is open, and the landing is not reserved
- 1. a stored check carry counts only under the policy version that judged it > an activation with checks: false: the carried check no longer counts, the obligation is open, and the landing is not reserved
- 1. a stored check carry counts only under the policy version that judged it > reservation itself refuses a ready landing whose carried check stopped counting: retryable, evidence-invalid
- 1. a stored check carry counts only under the policy version that judged it > reservation requires every obligation met on the integration, even one with no evidence the landing relied on
- 1. a stored check carry counts only under the policy version that judged it > the checker configuration changed: the carried check no longer qualifies
- 1. a stored check carry counts only under the policy version that judged it > the earlier check's key compromised after the carry: the obligation is open and the landing is not reserved
- 4. check carry needs a pinned runner; the signed volatile flag must be the configuration's > a carry rule for reviews only does not stop a check carrying; one for checks is evaluated, and allows it (amendment 3 seals its decision)
- 4. check carry needs a pinned runner; the signed volatile flag must be the configuration's > a check whose volatile flag contradicts the configuration (volatile: false) is check-binding; the matching flag is admitted
- 4. check carry needs a pinned runner; the signed volatile flag must be the configuration's > a check whose volatile flag contradicts the configuration (volatile: true) is check-binding; the matching flag is admitted
- 4. check carry needs a pinned runner; the signed volatile flag must be the configuration's > no runner environment pinned for the checker: the check does not carry (R-CARRY-14), and the landing waits
- 4. check carry needs a pinned runner; the signed volatile flag must be the configuration's > the pinned runner: the check carries and the landing completes
- 4d. a scoped check binds the snapshot commit the room recorded for the integration (R-OBL-3, R-CARRY-9) > a snapshot commit with another digest, another checker's commit, or an unrecorded commit is check-binding
- 4d. a scoped check binds the snapshot commit the room recorded for the integration (R-OBL-3, R-CARRY-9) > contract-shaped CheckJob fixture: the job's integration is the recorded snapshot commit, and the check lane G signs from it is admitted and counts for the landing

### `review-aabda1ed.test.ts` (1 of the 37 that ran)

- P1.4: after a policy activation, obligations are re-judged under the new requirement (R-POL-9, R-REV-1) > checker configuration: a check under the old configuration does not count under a new one

### `snapshot-repos.test.ts` (11 of the 11 that ran)

- R-CARRY-15: the filtered files > a submodule entry is never part of a snapshot
- R-CARRY-16: one repository per snapshot commit > an unknown create: a repository created with no answer is found and deleted by the alarm, and the job is issued from a new repository
- R-CARRY-16: one repository per snapshot commit > older snapshot, omitted file: the newer job's repository has neither the older snapshot's commit nor the omitted file's blob, advertises only refs/artroom/snapshot at its own commit, and its token reaches nothing else
- R-CARRY-16: one repository per snapshot commit > restart: a repository whose job was in flight when the room stopped is retired after the job's deadline, and the next attempt gets a new repository
- R-CARRY-16: one repository per snapshot commit > retirement after the last job ends is a durable duty, retried until Artifacts confirms the deletion
- R-CARRY-16: one repository per snapshot commit > reuse only for the same snapshot commit: a landing's job on the preview's integration shares the in-flight preview job's repository, with its own token
- follow-up c9cd4cd8 (1): a snapshot create is sent only after its wake-up is in storage > a snapshot wake-up that cannot be stored: no create is sent, the step is closed as never sent, and the job is tried again
- follow-up c9cd4cd8 (1): a snapshot create is sent only after its wake-up is in storage > the alarm is in storage while the snapshot create is outstanding; after the host stops, a fresh object's alarm deletes the late repository
- follow-up c9cd4cd8 (2): a fresh object schedules snapshot debt it finds > a snapshot repository's owed deletion, with no alarm stored: the fresh object stores one, and its alarm deletes the repository
- review 1701f73e: an imported room's jobs stay in its import namespace > filtered: the job reads the import namespace through the Room's binding for it, and the public namespace is untouched
- review 1701f73e: an imported room's jobs stay in its import namespace > whole-tree: the job reads the import namespace through the Room's binding for it, and the public namespace is untouched

## 4. Grant maps: `delegate` ops and room-custody sessions carry signed maps (R-DECL-17)

29 tests in 8 files.


### `amendment2.test.ts` (2 of the 8 that ran)

- edit 6: bearerAct and bearerRequest on the Worker's RoomWire (R-CRED-10) > a bearer claims, opens its workspace and gets the token, through the RPC target; never a session request or a roster act
- edit 6: bearerAct and bearerRequest on the Worker's RoomWire (R-CRED-10) > section 23, Bearer receipt after revocation: a retry returns the original; after revocation it is unauthenticated and records nothing; a kept signed envelope still returns its original

### `landing.test.ts` (1 of the 16 that ran)

- R-ADMIN configuration recovery and sole-admin approval > section 23, Policy lockout: the sole admin repairs the policy through a configuration-recovery lane; policy-activated follows

### `lanes.test.ts` (1 of the 19 that ran)

- R-WS workspace credentials > section 23, A requests the token with an old lease generation; after its key is revoked; after it is removed; under an expired delegation (R-WS-2)

### `mcp.test.ts` (10 of the 10 that ran)

- the RoomApi-per-bearer adapter (amendment 2, section 27) > a bearer claims, opens its workspace, proposes and lands through the MCP tools; acts are signed under its delegation
- the RoomApi-per-bearer adapter (amendment 2, section 27) > a kind the delegation does not grant is refused by the room, as a value
- the RoomApi-per-bearer adapter (amendment 2, section 27) > serves the reads stage 1 needs over RoomWire.read and subscribe with the bearer token: lanes, lane, proposal, op, wait, subscribe
- the official MCP client against the Worker, 2026-07-28 > lists the tools with object-rooted output schemas, and a refusal conforms to its schema
- the official MCP client against the Worker, legacy stateless (2025) > lists the tools with object-rooted output schemas, and a refusal conforms to its schema
- the route guards > a revoked delegation ends the session at the next request (R-CRED-3, R-CRED-10)
- the route guards > an unknown room is a 404 ArtroomError; a bad room segment is 400; the room's name works like its ID
- the route guards > legacy stateless mode: GET has no session stream, 405
- the route guards > no bearer, or a bearer this room does not know: 401 with WWW-Authenticate, before any tool runs
- the route guards > other paths are untouched: /mcp/x and /mcpx are the router's 404, not the MCP handler's

### `obligations.test.ts` (1 of the 21 that ran)

- R-REV revocation and evidence > R-REV-3: a compromised revocation revokes every delegation granted by or to the key

### `review-8faa2ef9.test.ts` (1 of the 15 that ran)

- '*' is fixed at the grant (R-ADM-5, R-LOG-10) > a member grants '*', then is promoted to admin: the delegation still covers only a member's kinds

### `review-aabda1ed.test.ts` (7 of the 37 that ran)

- P1.1: a room-custody redemption is all or nothing (R-CRED-9, R-CRED-3, R-ADM-12) > a policy refusal of the session grant records nothing, makes no key, leaves the invitation unused; a retry is refused the same way
- P1.1: a room-custody redemption is all or nothing (R-CRED-9, R-CRED-3, R-ADM-12) > a policy runtime failure during the session grant's evaluation records nothing; the retry succeeds
- P1.1: a room-custody redemption is all or nothing (R-CRED-9, R-CRED-3, R-ADM-12) > an interruption at redemption:after-delegate rolls back the join, the grant, the keys and the bearer
- P1.1: a room-custody redemption is all or nothing (R-CRED-9, R-CRED-3, R-ADM-12) > an interruption at redemption:after-join rolls back the join, the grant, the keys and the bearer
- P1.1: a room-custody redemption is all or nothing (R-CRED-9, R-CRED-3, R-ADM-12) > response-loss recovery: a retry is invitation-invalid and exposes no bearer or held key; a new invitation and retiring the stranded key recover
- P1.3: time-sensitive authority is judged again at the final boundary (R-ADM-6, R-ADM-4) > a delegation that expires while policy is evaluated: delegation-invalid, nothing recorded, the idempotency key not consumed
- P1.3: time-sensitive authority is judged again at the final boundary (R-ADM-6, R-ADM-4) > time passing without any log change is still seen: a delegation expired before admission is refused even with no new entry

### `roster.test.ts` (6 of the 26 that ran)

- R-ADM-12 and R-CRED-9: onboarding and custody by admission path > section 23, MCP redemption (R-CRED-3, R-CRED-9, R-ADM-12, R-SEC-5): a bearer shown once; the log holds the join and the delegate, never the token; acts are bounded by the session
- R-ADM-3 authority cases > R-ADM-5: a delegation grants only kinds the grantor's role may sign; a delegated key cannot re-delegate
- R-ADM-3 authority cases > R-ADM-5: a grantor's later loss of a kind stops the delegation covering it
- R-ADM-3 authority cases > section 23, Act under an expired delegation (R-ADM-4): refused delegation-invalid, not recorded
- R-ADM-3 authority cases > section 23, Recovery key (R-ADM-3d, R-GEN-3): set-role while no admin can act; a claim by it is role-forbids
- R-ADM-3 authority cases > section 23, Unjoined Worker: a delegated key that never joined acts for the grantor; after the grantor's key is revoked, delegation-invalid (R-ADM-3b, R-CRED-4)

## Tests with no conversion

126 tests passed with none of the four conversions: they send no act of a declared kind, no grant and no checker configuration. By file: `admission.test.ts` 8, `checker-join-recovery.test.ts` 3, `founding-gaps.test.ts` 21, `founding.test.ts` 15, `http.test.ts` 1, `hygiene-55be0661.test.ts` 6, `log-transfer.test.ts` 1, `mint-publication-78f0971c.test.ts` 3, `mint-sites-5ff58c9a.test.ts` 6, `phase2b.test.ts` 1, `pin-backlog.test.ts` 2, `pin-delay.test.ts` 6, `request-c657d4ba.test.ts` 13, `request-d268d249.test.ts` 6, `review-1249097f.test.ts` 6, `review-aabda1ed.test.ts` 6, `review-f060871b.test.ts` 1, `roster.test.ts` 15, `safe-errors-d29c09fa.test.ts` 6.


## Tests the declared run does not run

47 tests, each of which runs in the legacy run.


### `amendment3.test.ts` (1)

- R-CARRY-13: every check carry judgment is a sealed check-carried event > R-CARRY-13, R-LOG-10: artroom verify accepts a log with carried and not-carried events, replaying every decision

### `declared-fd6f00b6.test.ts` (39)

- R-DECL-24 at propose time, and the stage-4 steps > a document that uses a step or hold setting this room runs only from stage 4 is policy-invalid at propose time
- R-DECL-24 at propose time, and the stage-4 steps > a v2 document is validated by the acts validator with the room's historical opening kinds; a v1 checker configuration in it is refused
- R-DECL-24 at propose time, and the stage-4 steps > a workspace request is judged as for an act with step version on the thread (R-CRED-5 as amended)
- declared acts stage 2: one vocabulary per document (R-DECL-1) > a v1 room is the legacy vocabulary: a v: 2 envelope, a binding on v: 1, and recover are bad-request at step 1
- declared acts stage 2: one vocabulary per document (R-DECL-1) > a v2 room admits the code-review acts with their bindings; a thread records its kind, opening binding and lease length (R-DECL-6)
- declared acts stage 2: one vocabulary per document (R-DECL-1) > the room's binding is the policy package's binding identity (R-DECL-15), for each code-review kind
- grants carry the bindings their grantor signed (R-DECL-17) > a grant signed for a meaning that changed before its admission is binding-stale; a kind it does not declare is kind-undeclared; nothing is recorded
- grants carry the bindings their grantor signed (R-DECL-17) > a grant's plain kinds are bound by the grantor's role: a checker, who may not sign renew, may not grant it by a delegation, nor be invited with a session that lists it; nothing is recorded
- grants carry the bindings their grantor signed (R-DECL-17) > a room-custody invitation with no session grants renew and no declared kind; its bearer's code-review tools carry the code-review binding
- grants carry the bindings their grantor signed (R-DECL-17) > an exact retry of an admitted grant after a meaning change gets its receipt; acts under it are then delegation-invalid
- grants carry the bindings their grantor signed (R-DECL-17) > an invitation from before declared acts, redeemed after the first v2 activation, grants only the delegable platform kinds its session covered: one limited to claim and propose grants nothing, one that lists renew grants renew (intersection, never acquisition)
- grants carry the bindings their grantor signed (R-DECL-17) > an invitation signed before a meaning change and redeemed after it is binding-stale; the invitation stays unused
- grants carry the bindings their grantor signed (R-DECL-17) > an invitation's session map is judged when the invitation is admitted (R-DECL-17): a stale binding is binding-stale, an undeclared kind kind-undeclared, a kind the invited role may not sign invalid-body; nothing is recorded
- grants carry the bindings their grantor signed (R-DECL-17) > bearer acts: the named tools' code-review binding is admitted where claim means the code-review claim, and binding-stale where it does not
- grants carry the bindings their grantor signed (R-DECL-17) > grants from before declared acts: after the first v2 activation a v1-era * delegation covers renew and no declared kind; one limited to review and check covers nothing
- grants carry the bindings their grantor signed (R-DECL-17) > the grantor's role and who.delegable bound the map; a grant expanded before a kind was added does not cover it
- migration 4 (thread kind, binding and lease; grant maps) > a room stored at version 1, reopened: the columns are added, every lane gets its kind, binding and lease stay null, and reopening again changes nothing
- migration 4 (thread kind, binding and lease; grant maps) > a room stored at version 2, reopened: the columns are added, every lane gets its kind, binding and lease stay null, and reopening again changes nothing
- migration 4 (thread kind, binding and lease; grant maps) > a room stored at version 3, reopened: the columns are added, every lane gets its kind, binding and lease stay null, and reopening again changes nothing
- migration 4 (thread kind, binding and lease; grant maps) > migration 4 is idempotent: run twice on one store, it adds each column once
- recover, the platform kind (R-DECL-21) > an admin's own key opens, versions, approves and lands a recovery thread; any other signer is admin-required; a legacy recovery lane takes recover ops after the first v2 activation
- refusal wording from the declaration (R-DECL-13) > a platform refusal of a declared act takes the declaration's reason and fix, slots filled; the code is the room's; a rule's refusal keeps its own
- step 1 under the document in force (R-ADM-1 as amended) > admission judges step 1 again under the document it decides with: an envelope of the other vocabulary is bad-request there too
- step 4a: kind-undeclared and binding-stale, unrecorded (R-DECL-16) > a v: 1 envelope of a declared kind, and a v: 2 one with another binding, are binding-stale with the current binding and version; the signer signs again under the same key
- step 4a: kind-undeclared and binding-stale, unrecorded (R-DECL-16) > an undeclared kind is kind-undeclared after authority and before the body check; nothing is recorded
- step 4a: kind-undeclared and binding-stale, unrecorded (R-DECL-16) > exact retry: an act accepted before an activation, retried after it, gets its original receipt
- step 4a: kind-undeclared and binding-stale, unrecorded (R-DECL-16) > hold change: a claim signed before leaseSeconds or the scope source changed is binding-stale
- step 4a: kind-undeclared and binding-stale, unrecorded (R-DECL-16) > same-shape change: an act signed under [version], submitted after activation of [version, land], is binding-stale and no landing starts
- step 4a: kind-undeclared and binding-stale, unrecorded (R-DECL-16) > unrelated update: a new kind, a changed refuse rule, a new label or wording leave the binding equal, and the act is admitted
- the lease rule (R-DECL-6, R-DECL-9, R-DECL-15) > a revert thread opened under a v2 document records the room's lease; under a v1 document it records none
- the lease rule (R-DECL-6, R-DECL-9, R-DECL-15) > a thread records the room's numeric lease at open and keeps it across a restart and a deployment lease change, for renewal and expiry; a new thread takes the new lease
- the lease rule (R-DECL-6, R-DECL-9, R-DECL-15) > a v1 thread keeps today's behaviour: no recorded length, and the room's current lease after a deployment change, also once the room is v2
- the lease rule (R-DECL-6, R-DECL-9, R-DECL-15) > hold.leaseSeconds is the thread's lease length: renewal and expiry use it; a take-over keeps it
- threads (R-DECL-6, R-DECL-8, R-DECL-23) > a retired opening kind: its held thread with an open version can still be reviewed and released by acts that name it; a new act of it is kind-undeclared
- threads (R-DECL-6, R-DECL-8, R-DECL-23) > a room thread (a revert lane, R-REV-6) takes the code-review acts that name room: claim, propose, note, review, land and release
- threads (R-DECL-6, R-DECL-8, R-DECL-23) > an entry target is not a thread target: a note on an entry of a thread its threads do not name is admitted; on a line of it, wrong-thread
- threads (R-DECL-6, R-DECL-8, R-DECL-23) > take-over with a new scope: a released claim taken over with a different scope moves its scope and lease generation; an overlap with an exclusive held thread is scope-overlap
- threads (R-DECL-6, R-DECL-8, R-DECL-23) > wrong-thread is recorded at step 7: a thread whose kind the act does not name, a declared act on a recovery thread, and recover on an ordinary one
- who may sign: who.roles, admin implicit (R-DECL-11) > a declared kind's roles decide at step 4, unrecorded; an admin may sign every declared act; renew keeps the legacy table

### `declared-rows-fd6f00b6.test.ts` (1)

- condition 5: rows written per act, legacy and declared (request fd6f00b6) > the declared path writes no row more than the legacy path for any act, admission alone or with its alarm work

### `log-bounded.test.ts` (1)

- request 5a7290b9: publication reads the log in batches > never more than READ_LIMITS.entries entries per read; after the first publication only the last segment is read; a retained file is read only when new

### `log-transfer.test.ts` (2)

- a publication larger than one transfer > an object larger than one transfer is staged in chunks of itself, and publishes
- a publication larger than one transfer > is staged in bounded parts and pushed with no objects; the whole cohort publishes to a verified log head

### `log.test.ts` (1)

- section 23, Log construction (R-LOG-2, R-LOG-8, R-LOG-12, R-LOG-13) > a new claim, its notified event, and the first two publications, in the order of the worked example; both commits verify

### `phase2b.test.ts` (2)

- offline replay of the produced log (lane L's verifyLog, R-LOG-10) > a session with roster acts, reviews, a check, a landing and a revocation publishes a log that verifies, with every decision replayed
- the adapters' boundaries > the production log remote, as the live services behave: the ref is read by the sandbox, objects through the binding of whatever type, each hashed; verifyLog runs over it
