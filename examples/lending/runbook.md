# Provision and run the lending library

**Run status: the final room completed the exact-script automated browser
story and all seven publications.** The curated public Git history is now published and anonymously verified.
Homepage publication completed; the original f33 gate and later receiving
MCP correspondence remain separate, as recorded below. Two earlier rehearsals are retained.
The member interface offers **Cancel this thing** and its reason box only
after membership confirms that the signer's role holds `lending.staff`.
The control is hidden while that read is loading or unavailable. The scope
still refuses an unauthorized cancel if the observed role is stale.

The publication rehearsal produced real browser acts, written receipts, and
anonymous immutable pages. Its Small pot description differed from the
approved script, so its mechanical completion is not final story acceptance.
The [earlier rehearsal](#the-rehearsal-run-14-october-2026) remains a separate,
nonpublishing room. The fresh final room has been created and inspected. The Library, browser story, and per-step publication results now have their
own original evidence. Final public-history and homepage results remain separate.

The approved [library design](../../notes/2026-10-13-lending-library.md)
remains unchanged. Amendment `19264feb21b49756fb3e9913b0ba11b2520e1e3a`
requires all six outputs and replaces browser page edits with publication
from the lending fold. The [publication design](../../notes/2026-10-13-fold-publication.md)
is approved. Its implementation landed at
`5e11ca0300cc0a538f7c59b36d490f5cf14be15f`, from reviewed code
`7335aa27d3b5b42026ba1f6b3192692918d5e59e`. The full six-output request
remains open until its deployed and public witnesses are complete.

## Bind the service and room

Use `packages/cli/bin/dap.js` from the approved, landed checkout. The
final service is `https://dap-library-publication-final-1014.inguz.workers.dev`.
Its Worker and Artifacts namespace are `dap-library-publication-final-1014`.
Its configured version is `db397334-9455-436d-b197-1faba3a9f90c`; SQLite is
`975bba8bbe8e4921a643d82a7e14f89e`. The older `dap-lending`,
`dap-lending-demo-1014`, and `dap-library-publication-1014` remain separate.

The following commands describe provisioning, not permission to replay a
completed run. The final room already exists. Retain its original plan and operator key;
do not rerun provisioning against that custody. The earlier publication
rehearsal's custody and record remain intact. The final register and service
configuration are bound to their own original plan, not inferred from a rehearsal.
A seat is your registration in membership. A device key signs acts for that
seat. The operator key signs installation and setup, and is kept separately
from each browser's nonextractable device key.

Keep the operator key and each original request in a separate, owner-only
`DAP_HOME` outside the checkout. Existing `ARTROOM_HOME` settings remain
accepted, but the two variables must name the same directory when both are
set. Do not expose invitation links, private keys, session headers, or
pending envelopes in public evidence.

The shell commands below also expand `$DAP_HOME`. If you currently set
only `ARTROOM_HOME`, export its existing directory in the same shell:

```sh
export DAP_HOME="${ARTROOM_HOME:?Set ARTROOM_HOME to your existing config directory}"
```

This selects the same custody; it copies no files and creates no new key.
If you already set both variables, keep them pointed at that same directory.

```sh
node packages/cli/bin/dap.js install --plan "https://dap-library-publication-final-1014.inguz.workers.dev" --cohort application-publication --host artifacts --namespace "dap-library-publication-final-1014"
```

Retain the original plan, deadline, and register ID. Set `ARTIFACTS_CONFIG`
from that plan: exactly `registerScope`, `namespace`, `host`, `maxBytes`, and
`credentialIdentity: "adapter-attempt"`. The host is the verified Artifacts
hostname, not the install selector `artifacts`. Match the namespace to
`ARTIFACTS_NAMESPACE` and the `ARTIFACTS` binding. Configure the new Worker
through the reviewed deployment procedure, preserving its session secret.

Then finish the same original plan:

```sh
node packages/cli/bin/dap.js install --planned --cohort application-publication
node packages/cli/bin/dap.js create lending-library --handle @library-operator
```

A selected plan lives for 840 seconds. An unknown attempted install keeps
its original envelope and deadline. Do not refresh the plan or silently
replace the operator key. Check and reconcile the retained outcome before
any new mutation. An unattempted expired plan remains retained; a new plan
requires a separate empty custody directory and its own configured register.

The retained run reports original final plan `55114`, install `58075`, verification
`79522`, creation `90673`, and native inspection `85900` completed with exit 0.
The final founder is `@library-operator`. Its recorded Artifacts repository is
`jfdinhhufm5jfjqr4cqsgk5kvw2lhyxx5lh4gaqgp74ldijemsla-1`.
The later browser run `9377` separately proves the final Library journey;
provisioning alone did not show an act taking effect.

Record full references, including incarnation, for register 9, directory 8,
membership 4, rules 3, destination 4, and inbox 1. The new cohort does not
upgrade the earlier register 5, directory 5, and destination 2 rehearsal.

The rules scope stores definition activations and checker configuration.
Rule expressions are part of a definition; they are not that rules scope.
An act is signed. An action such as `lending.member` is a role permission
that allows a member's key to sign the corresponding acts.

## Establish the current lending application

Use the approved declaration's canonical bytes under the deployed bounds.
Its pin is
`sha256:6fff876ce1c64afedfe9b5ba2864aa31a7a7d5e7e05d7b83619c00e168786ee7`.
The checked-in authoring file has one trailing LF. `--value` sends a file
unchanged, so remove that authoring newline before activation or establishment.
The current canonical input is 4,458 bytes, not the 4,459-byte authoring file.

```sh
umask 077
node -e 'process.stdout.write(require("fs").readFileSync("examples/lending/definition.json", "utf8").replace(/\n$/, ""))' > "$DAP_HOME/lending.json"
node packages/cli/bin/dap.js act activate --on rules --set digest=sha256:6fff876ce1c64afedfe9b5ba2864aa31a7a7d5e7e05d7b83619c00e168786ee7 --set name=lending --value "$DAP_HOME/lending.json"
node packages/cli/bin/dap.js act establish-application --on directory --set definition=sha256:6fff876ce1c64afedfe9b5ba2864aa31a7a7d5e7e05d7b83619c00e168786ee7 --set 'values={}' --set execution=recorded-do --value "$DAP_HOME/lending.json"
```

Keep the exact signed establishment request before submission. Reconcile
an unknown answer against the fact that records its original act taking effect and confirmed child seed.
Directory 8 supplies the trusted opener and the room's own destination.
The caller supplies canonical `{}`; the caller cannot override `destination`.

In the retained publication rehearsal, original activation `81460` refused `bad-field` when
sent the authoring LF. Corrected canonical activation `87349` was recorded
at rules sequence 2. Establishment `84688` was recorded at directory sequence
5. Both original outcomes remain part of the evidence. In the final room,
the retained run reports canonical activation `71302` recorded at rules sequence 2. The established final Library is now observed as
`sc_vlhn4jvbohib33xwlhqntgo4enlsbvsu4x5fipygw6twfgl7ljua`, incarnation `in_slxgyvbpyi6vqxxj6xv6bhrnfi`.
Do not reuse the rehearsal's Library reference.

## Preserve each role's actions

Read and retain the actual membership role lists before changing them.
`set-actions` replaces a whole list. For `admin`, preserve every existing
action and add `lending.member` and `lending.staff`. For `member`, preserve
every existing action and add `lending.member`. Keep required administration,
application, and change actions already present.

Use the complete actual lists, encoded as JSON, in these command shapes:

```sh
node packages/cli/bin/dap.js act set-actions --on membership --target 0 --set role=admin --set 'actions=<complete-admin-JSON-list>'
node packages/cli/bin/dap.js act set-actions --on membership --target 0 --set role=member --set 'actions=<complete-member-JSON-list>'
```

Keep both before and after lists and the facts of the acts that took effect. Show that an
admin still has an earlier administration action, and that a member keeps
its earlier actions. Do not claim immediate revocation. The native scenario
advances a scripted clock by 301 seconds; it does not prove deployed elapsed
time. Measure the actual grant reuse window before the lending acts.

## Join in a browser and show custody

**Issue each person invitation with `dap invite --keep`.** It reads the
actual membership's definition, checks the issuer's active key and
`membership.invite`, and checks the directory's membership, rules and
destination references against that definition's directory. It makes the
invitation secret and keeps it with the exact signed `invite-member`
request in an owner-only private file before anything is sent. It verifies
the receipt confirming that the act took effect, the recorded invitation's handle, role, hash and
expiry, and prints a link tagged with the membership's exact definition,
`platform:membership@4` here:

```sh
node packages/cli/bin/dap.js invite @nasruddin --role member --keep
```

If the answer is lost, run `dap invite --check`, which reads the outcome
and sends nothing, or `dap invite --continue`, which resumes the exact
original request. While an invitation is unresolved the command refuses a
new one; do not issue a second invitation to replace an unknown one.
`packages/cli/test/agent-key.scope.test.ts` shows a lost answer checked
and the link joined on a membership 4 room. In the retained publication rehearsal,
the retained run reports verified four-hour invitations for `@neighbour` as admin and
`@nasruddin` as member. The founder remains `@library-operator`.

The CLI's person join loads the explicit membership pin and keeps its
signed join. The Library browser additionally requires the membership 4
tag and the current service origin, then verifies the native receipt
before enrollment is confirmed.

Open the verified library service's `/lending/` interface in an independent
browser profile. Paste the invitation into **Invitation link** and use the
actual join control. Record the browser's exact control labels during the
run. Do not put the invitation, secret, key, or session headers in public
evidence.

Verify a distinct browser device key and membership 4 enrollment with the
native receipt confirming that the act took effect, full membership reference, and incarnation. A test
Worker result does not substitute for this deployed browser witness.

If an actual request has an unknown answer, reload and use **Check the join**
for enrollment, or **Check** for a lending act. Continue only the same retained
request through its supported recovery path. Keep the fact confirming that the act took effect and
exactly one donation or enrollment. The retained run reports both browser joins in the
publication rehearsal. Nasruddin's lost join answer was reconciled with
**Check the join**, without a second act. The later Small pot donation was
also reconciled with **Check**. Keep both recoveries with their original room;
no additional induced interruption is a condition of final acceptance.

The final run `9377` passed in three separate persistent browser profiles.
The retained run reports distinct nonextractable device keys. The join that took effect before its answer was lost
and the lost Small pot answer were both reconciled with **Check**, without
second acts. The run is machine-operated and does not show human acceptance
or two physical devices. Preserve the earlier rehearsals' recoveries as their
own evidence too.

## Play the story and complete publication

Play [the demo script](demo-script.md). Keep the seven lending acts that took effect
in order with their signers, alongside genesis and any other actual journal
entries. Record both refusals separately. Read actual item numbers from the
journal; do not infer them from their names or a test fixture.

The deployed browser signs bounded shelf text with each lending request.
The destination judges and publishes that text. The browser separately reads
the immutable page at a commit; an act taking effect alone does not prove publication.
Do not manually edit repository files to impersonate fold publication.
For each lending act that takes effect, check publication separately from the act taking effect:
its original send, the destination receipt naming the sending entry and send
ordinal, the commit, and the thing's fixed `shelf/<16 characters>.md` path.
The browser chooses that path before donation is signed. The page cannot
name the future entry that creates it. The signed text names the lending
scope and incarnation; the receipt ties the commit to its actual entry.
Retain pending or unknown outcomes honestly.

Verify a cancelled thing's page remains present with its reason. A member's
name, description, and reason are literal text. The current renderer can
autolink a bare address or email address; this is the recorded deviation from
the design's stronger “or a link” wording, not arbitrary markup permission.

An unauthenticated visitor must read the shelf listing, the thing pages,
and repository commit history. Check that each page names the lending
scope and incarnation, and use the destination's receipts to match each
commit to the lending entry that sent it. The lending journal is for
members with a seat; record an actual
unauthenticated refusal rather than publishing a private read credential.
This is the public-history witness. The retained run reports the publication rehearsal's clone and Git extraction completed
mechanically. The final exact-script run completed its seven lending acts and publication
receipts. The final original clone and extraction passed: actual Git commit
bytes, linear parents, page blobs, and all seven fetched receipt refs and
canonical receipt bodies were verified. The later ordinary history publication completed at commit
`14401f8bd851ce525ac1526ed57d2bceaf36d360`, separate from the seven-story
commit `bd724ee1d21486dbe822faf740312318be38cb5d`. Readback `19810`
verified 19 anonymous responses: the index, 14 raw commit and receipt
attachments, the shelf folder, and three current pages. It checked the
ordinary written receipt and the child's published result after normal
cleanup. This does not prove judgment Replay, independently fetched new
history Git objects, or human acceptance.

The completed history publication retained an original merge refusal:
`guard-failed`, naming `approvals-needed`, at child entry 20. The operator
published a replacement policy at rules entry 7, changing the global
approval floor from 1 to 0 while preserving all four extent requirements.
The existing change requested those rules at entry 21. Checkpoint `68996`
verified the rules reply at entry 8 and its application at child entry 22;
the original manifest at child entry 20 stayed unchanged. The fresh merge
at child entry 24 took effect. Nonhistory lanes can now pass early admission,
but the destination still requires their explicit extent approval of 1;
the history extent requires 0.

That ordinary merge published history commit
`14401f8bd851ce525ac1526ed57d2bceaf36d360`. Destination publication 66
reached its published transition at 73, produced written receipt 77, and
was normally cleaned at 81. These are observations of a completed run,
not instructions to repeat policy changes or merge in the existing room.
Keep the original refusal and correction with their original journal facts.

Members can inspect the lending journal with the actual full scope reference:

```sh
node packages/cli/bin/dap.js log "<lending-scope>"
node packages/cli/bin/dap.js verify "<lending-scope>"
```

Record verifier coverage and trusts as well as the result. Missing foreign
journal entries are a finding, not a successful verification.

## Bind the homepage destinations

The Home links are ordered **Room, Library, Counter, Jam, Documentation**.
The Library page has three destinations, each bound only after
verification:

| Destination | Required result before adding its link |
| --- | --- |
| Member interface | Deployed `/lending/` screens, actual membership 4 browser join, and original-request recovery shown. |
| Published shelf | Anonymous read of the final room's shelf pages and current public history. |
| Members' journal | Verified member interface journal view or documented route for a member with a seat. No invitation or credential in the URL. |

The earlier member-interface and members' journal links targeted the
`https://dap-lending.inguz.workers.dev/lending/` rehearsal and landed at
`26d2bc8a`. Preserve that historical record. The final Library links now
serve from [the public homepage](https://dap.generalbusiness.ai/library/):
the open-library button and member-interface link use the final service,
and the shelf and public-history links use its verified Site routes.
The member journal remains in the member interface after joining.

Original Home publication `89750` completed with exit 0. Version
`08166185-ce73-473a-b3f7-1684c038ff83` serves 100% of traffic. All 13
anonymous static reads matched the retained build's bytes, MIME types,
cache policy, titles, and anchors; all four Library hrefs matched. The
existing domain and protected resources were preserved. This upload reused
the original 14-file build `55847`; it did not run another build or gate.
These readbacks do not prove rendered geometry or human acceptance.

## The rehearsal run, 14 October 2026

Hugh asked on 14 October 2026 for the member interface first: deploy,
provision and play the story without publication, link the member
interface from the homepage, and add the published shelf when publication
is built. This room is that rehearsal. It is not the final online shelf:
the final room is provisioned after the publication design is approved and
built, under the pins it then needs.

| Step | Observed |
|---|---|
| Code | Main `dedcb14b`. |
| Service | Worker `dap-lending`, `https://dap-lending.inguz.workers.dev`, its own Durable Object namespace and Artifacts namespace `dap-lending`. Version `4b289327-c1c8-47fa-b108-ce84cad6975a` carries `ARTIFACTS_CONFIG`. `DEPLOYMENT` and `SESSION_SECRET` were set through stdin. |
| Room | `install --plan --cohort application`, then `install --planned`, then `create lending-library --handle @neighbour`: register `sc_c67lq575…`, directory `sc_sgj2favz…` (`platform:directory@5`), membership `sc_x6lr4msi…` (`@4`), rules `sc_xeeasdyw…` (`@3`), destination `sc_kkehgsll…` (`@2`); each created and confirmed. |
| Definition | `activate` took effect at rules entry 2; `establish-application` at directory entry 5. The lending scope is `sc_vsleihvx…`, under the pin `sha256:439cd20e…`. |
| Roles | The founding lists were read from the membership's genesis. `set-actions` took effect at membership entries 5 and 6: admin 36 actions plus `lending.member` and `lending.staff`; member 23 plus `lending.member`. The first lending act took effect 124 seconds after the grants, with no wait. |
| Invitation | `@nasruddin`, role member, issued with `dap invite --keep` from head `9356257c` of request `53850986` (under review, not yet landed), at membership entry 7. |
| Browser join | Chrome, its own profile, driven by Playwright. The answer to the join was dropped after the scope received it. The page said "No answer came back that could be trusted. The original join is kept." After a reload, **Check the join** read the original: "You joined as @nasruddin." One join, membership entry 8. |
| Story | Seven acts in the script's order, lending entries 2 to 8: donate Big pot (@neighbour, command line); borrow, return, donate Small pot, borrow (@nasruddin, browser); cancel "Nasruddin says the pot died" and donate New big pot (@neighbour, command line). |
| Interrupted donation | The answer to the Small pot donation was dropped after the scope received it. After a reload the page offered **Check**, **Continue** and **Give up**; **Check** said "The kept request took effect." One donation, entry 5. |
| Refusals | The neighbour's borrow of the lent big pot: `guard-failed`. Nasruddin's cancel, reason "The pot died": the page offers **Cancel this thing** to a member too, and shows "Only staff can cancel a thing. (unauthorized)". Neither is in the journal. |
| Verify | `dap verify` on the lending scope: consistent, replay mode, entries 0 to 8 with the directory, register, membership, rules, destination and inboxes it names. |

Corrections found in the run:

- `examples/lending/definition.json` ends with a newline, and the pin is
  the digest of the bytes without it. `--value` sends a file as it is, so
  the runbook's first commands were refused `bad-field`. The commands
  above now send a copy without the newline.
- During this rehearsal, the interface offered a cancel button to an
  ordinary member, and the scope refused the act. Shot 8a was changed to
  show that refusal. The current interface hides the button unless the
  signer's observed role holds `lending.staff`.

Not done in this run: publication, the published shelf, the public
history witness, and a second physical device.

## Observation ledger

The publication rehearsal has deployed assets, native provisioning, browser
joining and recovery, publications, and a mechanically completed Git clone
and extraction. Its description mismatch prevents final script acceptance.
The final run `9377` passed with the approved Small pot description, both
original-answer checks, and three anonymous pages at commit
`bd724ee1d21486dbe822faf740312318be38cb5d`. The original clone and extraction passed, including actual parents, page
blobs, and receipt bytes. The curated public history was published and its index, raw companions,
and current shelf pages were anonymously verified at
`14401f8bd851ce525ac1526ed57d2bceaf36d360`. The original gate at
`f33a7d7feadeda092151aab5a993be37fb24edae` completed: 1,197 Vitest
cases passed and three were skipped; the Node groups passed 10 and 55 cases.
The later receiving commit `12a99599de2c2514a50be22f6194d1813d5c38d0`
preserves that candidate while composing separately approved Main MCP
changes. That correspondence is separate from the original gate; no gate
on the combined commit is claimed. Homepage publication `89750` completed
separately with all 13 static readbacks matching. The full six-output request
awaits its final review. Keep each rehearsal's original results, failures,
and uncertainties separate from the completed final run.

| Output | Evidence to record |
| --- | --- |
| 1. Definition and scenario | Exact approved bytes and pin; real-scope story, refusals, another member's return, live-item bound, and final-state witnesses. |
| 2. Member interface | Actual screens, browser storage, distinct device join, original-request custody and recovery, the act taking effect and publication shown separately. |
| 3. Deployed runbook | Service/version/bounds, full scope references, original commands and receipts, complete role lists and measured grant window. |
| 4. Demo script | Actual controls and outcomes for every shot; preserve Nasruddin's exact spoken line and donation description. |
| 5. Online room | Final room with the story already played, three shelf pages at their `shelf/<16 characters>.md` paths, cancelled-page reason, destination receipts, public commits and member-only journal. |
| 6. Homepage Library | Verified three destinations, required Home ordering, original normal publication and served readbacks. |

A local test, plan, or prepared page does not close the six-output request.
