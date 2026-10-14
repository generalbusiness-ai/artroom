# Provision and run the lending library

**Run status: a rehearsal ran on 14 October 2026, without publication;
see [the rehearsal run](#the-rehearsal-run-14-october-2026).** This is
the operator runbook for the full lending request. Its rehearsal section
records one deployed run, with browser results, in a rehearsal room. It
records no final online room and no published page. Fill the observation
ledger from the original run before calling those outputs delivered.

The approved [library design](../../notes/2026-10-13-lending-library.md)
remains unchanged. Amendment `19264feb21b49756fb3e9913b0ba11b2520e1e3a`
requires all six outputs and replaces browser page edits with publication
from the lending fold. The [publication design](../../notes/2026-10-13-fold-publication.md)
is approved, and its build landed on main `5e11ca03`. The commands below
are for the final room, under that build. The rehearsal room was made
earlier, under the first definition; its section records its own
commands and pins.

## Bind the service and room

The commands use the launcher `packages/cli/bin/dap.js`. The rehearsal
ran them on 14 October 2026. The final room has not been provisioned.

Record the approved commit, deployed bounds, exact application cohort,
Worker name, Artifacts namespace, and verified service origin. Use a separate
library deployment whose Artifacts binding and register configuration belong
to this room. Do not repoint the workroom's register configuration. Public
destinations are unset until their original readbacks have been verified.

Keep the operator key and each pending envelope in an owner-only
`ARTROOM_HOME`. Supply the actual service origin and namespace below:

```sh
node packages/cli/bin/dap.js install --plan "<service-origin>" --cohort application-publication --host artifacts --namespace "<namespace>"
```

Retain the printed plan, its deadline, and its register ID. Set that
register ID in the library deployment's `ARTIFACTS_CONFIG`. Its namespace
must match both `ARTIFACTS_NAMESPACE` and the `ARTIFACTS` binding. Complete
that deployment configuration through the separately reviewed deployment
procedure. Then finish the retained plan:

```sh
node packages/cli/bin/dap.js install --planned --cohort application-publication
node packages/cli/bin/dap.js create lending-library --handle @neighbour
```

If the result is unknown, preserve the original plan and request. Resume
that request through the supported recovery path. Do not create another room
to replace an uncertain first one.

Record full register, directory, membership, rules, and destination
references, including incarnation and definition. The
application-publication cohort uses register 9, directory 8, membership 4,
rules 3, destination 4 and inbox 1. It is not the demo or Counting cohort. Verify actual creation
and confirmation receipts before taking the next step.

The rehearsal room keeps its recorded first pins. Publication changed the
lending pin and added the `destination` genesis field, so the final room
is a new room under those values. Do not silently upgrade the earlier room
or call its unpublishing rehearsal the final online shelf.

## Establish the current lending application

Validate the exact declaration under the deployed bounds through the public
validator. Keep the canonical declaration bytes and their digest with the
run's evidence. The current pin, in `pin.ts`, is
`sha256:6fff876ce1c64afedfe9b5ba2864aa31a7a7d5e7e05d7b83619c00e168786ee7`.
The rehearsal room used the first definition's pin,
`sha256:439cd20ea9e0b72294d091d3bdcfe13de8c1f31d5685c40bc7bd2754860784ff`, from main `dedcb14b`.

```sh
node -e 'process.stdout.write(require("fs").readFileSync("examples/lending/definition.json", "utf8").replace(/\n$/, ""))' > "$ARTROOM_HOME/lending.json"
node packages/cli/bin/dap.js act activate --on rules --set digest=sha256:6fff876ce1c64afedfe9b5ba2864aa31a7a7d5e7e05d7b83619c00e168786ee7 --set name=lending --value "$ARTROOM_HOME/lending.json"
node packages/cli/bin/dap.js act establish-application --on directory --set definition=sha256:6fff876ce1c64afedfe9b5ba2864aa31a7a7d5e7e05d7b83619c00e168786ee7 --set 'values={}' --set execution=recorded-do --value "$ARTROOM_HOME/lending.json"
```

Keep the exact signed establishment request before submission. Reconcile an
unknown answer against its original recorded fact and confirmed child seed.
Record the application's actual full reference. Its factory supplies the
trusted opener, membership and destination. The caller's genesis values
are `{}`: the factory refuses a `destination` in them.

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

Record both before and after lists and their recorded facts. Show that an
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
request in an owner-only private file before anything is sent. It verifies the receipt, the recorded invitation's handle, role, hash and
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
and the link joined on a membership 4 room. The rehearsal issued
`@nasruddin`'s invitation this way on the deployed service.

The CLI's person join loads the explicit membership pin and keeps its
signed join. The Library browser additionally requires the membership 4
tag and the current service origin, then verifies the native receipt
before enrollment is called joined.

Open the verified library service's `/lending/` interface in an independent
browser profile. Paste the invitation into **Invitation link** and use the
actual join control. Record the browser's exact control labels during the
run. Do not put the invitation, secret, key, or session headers in public
evidence.

Verify a distinct browser device key and membership 4 enrollment with the native receipt, full membership reference, and incarnation. A test
Worker result does not substitute for this deployed browser witness.

Exercise an interrupted donation and an interrupted join at the reviewed
custody boundary. Retain the original request before dispatch. Reload, then
use **Check the join** or **Continue the join** for enrollment, and
**Check** or **Continue** for a lending act. These are the prepared SDK
interface labels, not observed browser results. Record the fact and exactly one donation or enrollment.
Do not sign a replacement for an unknown original. The custody owner prepares
and reviews this harness separately; these steps have not been run.

## Play the story and complete publication

Play [the demo script](demo-script.md). Keep the seven lending acts that took effect in order with their signers, alongside genesis and any other actual journal
entries. Record both refusals separately. Read actual item numbers from the
record; do not infer them from their names or a test fixture.

The rehearsal room runs the first definition, which does not publish, and
its screens show shelf text as unpublished. Do not manually edit repository
files to impersonate publication. Publication landed on main `5e11ca03`:
the final room is created with `--cohort application-publication` under the
current pin in `pin.ts`, and its directory supplies the destination. Bind
those exact definitions, then run the final story.

For each lending act that took effect, record publication separately from
acceptance: its original send, the destination's receipt, which names the
sending entry and send ordinal, the commit, and the thing's shelf path.
The interface chooses that path at donation, `shelf/<16 characters>.md`,
and the thing keeps it. A page cannot name the entry that makes it,
because its text is signed before the entry exists. It names the lending
scope and its incarnation; the receipt ties each commit to its entry.
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
This is the public history witness. It remains unrun.

Members can inspect the lending journal with the actual full scope reference:

```sh
node packages/cli/bin/dap.js log "<lending-scope>"
node packages/cli/bin/dap.js verify "<lending-scope>"
```

Record verifier coverage and trusts as well as the result. Missing foreign
journal is a finding, not a successful verification.

## Bind the homepage destinations

The Home links are ordered **Room, Library, Counter, Jam, Documentation**.
The Library page has three destinations, each bound only after
verification:

| Destination | Required result before adding its link |
| --- | --- |
| Member interface | Deployed `/lending/` screens, actual membership 4 browser join, and original-request recovery shown. |
| Published shelf | Anonymous read of the final room's shelf pages and current public history. |
| Members' record | Verified member interface record view or documented route for a member with a seat. No invitation or credential in the URL. |

Two are linked now, to the rehearsal room: the member interface at
`https://dap-lending.inguz.workers.dev/lending/`, which also shows the
members' record. That link landed on main `26d2bc8a` after the rehearsal
join and recovery were seen. The published shelf is unlinked, and the
page says so. When the final room exists, point the links at it, add the
shelf's verified URL in the final commit, then run the homepage's own test
and one final gate. Publish the homepage only after that commit is
approved and landed. Retain its original build,
deployment version, and byte, MIME, cache, and link readbacks.

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
| Refusals | The neighbour's borrow of the lent big pot: `guard-failed`. Nasruddin's cancel, reason "The pot died": the page offers **Cancel this thing** to a member too, and shows "Only staff can cancel a thing. (unauthorized)". Neither is in the record. |
| Verify | `dap verify` on the lending scope: consistent, replay mode, entries 0 to 8 with the directory, register, membership, rules, destination and inboxes it names. |

Corrections found in the run:

- `examples/lending/definition.json` ends with a newline, and the pin is
  the digest of the bytes without it. `--value` sends a file as it is, so
  the runbook's first commands were refused `bad-field`. The commands
  above now send a copy without the newline.
- The demo script's shot 8a said not to claim that the member interface
  offers a cancel button to a member. It does, and the scope refuses it.
  The script now shows that refusal.

Not done in this run: publication, the published shelf, the public
history witness, and a second physical device.

## Observation ledger

This is the final six-output ledger, for the final room. All its
deployed and browser observation slots are **UNRUN**; the rehearsal
section above is separate and does not fill them.
The existing definition and native-fixture witnesses remain tied to the
commits they ran against; this ledger does not say they never ran. Record original
terminals and uncertain outcomes before any continuation. Keep failed
attempts as evidence.

| Output | Evidence to record |
| --- | --- |
| 1. Definition and scenario | Exact approved bytes and pin; real-scope story, refusals, another member's return, live-item bound, and final-state witnesses. |
| 2. Member interface | Actual screens, browser storage, distinct device join, original-request custody and recovery, acceptance and publication shown separately. |
| 3. Deployed runbook | Service/version/bounds, full scope references, original commands and receipts, complete role lists and measured grant window. |
| 4. Demo script | Actual controls and outcomes for every shot; preserve Nasruddin's exact spoken line and donation description. |
| 5. Online room | Final room with the story already played, three shelf pages at their `shelf/<16 characters>.md` paths, cancelled-page reason, destination receipts, public commits and member-only journal. |
| 6. Homepage Library | Verified three destinations, required Home ordering, original normal publication and served readbacks. |

A local test, plan, or prepared page does not close the six-output request.
