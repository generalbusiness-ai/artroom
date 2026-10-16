# Fresh-founder offer: a narrow register read

9 October 2026. Design/protocol amendment proposal for request `87d174b5e4d6f17d8c172d1ccfdc5981d2d75a78`, promise `7f91000b42831f7ddf1649e0ea158dfda00d013f`, following accepted planning report `21f6855920ec3e74c93cfedf351a2c4ee6af4995`. Source baseline is main `f6d80b3996df7ad3e7d00feff88d48cf29877ddc`; inherited stale bases remain disclosed. This note is for independent design/authority review and explicit planner adoption before implementation. No endpoint, client, native definition, test, provider, installation or room was changed or run.

## Purpose and current boundary

A fresh prospective founder needs the revision of the register item to sign native `found`. CLI `claim` and Page `allowedClaim` first request its Summary. Current signed Summary requires a recent local/root signer; a genuinely new key has neither. Native `found` separately admits a key under the register's immutable `open` policy or immutable founders allowlist. This read supplies the narrow missing input without granting whole Summary/history or borrowing an operator key.

An **offer context** is an exact full register reference, explicitly selected supported register pin, branch and founder handle. Its **caller** is the key signing the request. An **offer** is a bounded current read of one stable register item, its revision and this caller's policy eligibility. It is neither a grant, lease, sealed fact, scope-head sample nor a promise that `found` will be admitted.

## Exact proposed wire and types

Extend the native read ABI with capability `founding-offer@1`. Do not change the existing `Read<T>` shape by inventing its required `at` head. Use this distinct result type:

```ts
interface FoundingOfferContext {
  v: 1;
  register: ScopeRef; // kind "register", including incarnation
  definition: PlatformDefinition; // explicit supported register pin
  branch: string;
  founderHandle: MemberId;
}
interface FoundingOffer {
  v: 1;
  capability: "founding-offer@1";
  context: FoundingOfferContext;
  actor: KeyId;
  argument: Digest;
  item: { id: number; revision: number };
  eligible: true;
  policy: "open" | "keys";
  observed: Timestamp;
  expires: Timestamp;
}
type FoundingOfferAnswer =
  | { ok: true; offer: FoundingOffer }
  | { ok: false; reason: "forbidden" | "clock-behind" |
      "unsupported-read" | "unavailable" };
```

All objects have exactly the members shown. ScopeRef, key/digest/time/local IDs use existing native validators; integers are nonnegative safe integers. Branch and handle are well-formed Unicode and at most 256 UTF-8 bytes. Handle must satisfy the existing `isHandle` grammar (`@[a-z0-9]([a-z0-9-]*[a-z0-9])?`). Branch uses the native pinned `found` field's current text shape; this offer adds no unadopted Git branch grammar or repository existence promise. Client still presents the exact selected text to native admission/provider judgment.

HTTP: `GET /v1/scopes/<register-scope-id>/founding-offer`, with no query/body. Context is `X-Artroom-Founding-Context: <unpadded base64url of canonical UTF-8 JSON context>`. Authorization uses the existing `Signed <unpadded base64url of canonical SignedRead>` form. Add `"founding-offer"` to SignedReadName only for this operation. Signed request remains `{v:1,to:register.scope,actor,read:"founding-offer",arg,notAfter}` and its signature remains Ed25519 over `artroom-read-1`, newline, canonical request JSON.

Define `arg = digestBytes(taggedBytes("artroom-founding-offer-context-1", canonicalBytes(context)))`. This NEW argument domain separates the entire reference/pin/branch/handle from retained-resource arguments and other reads; actor and notAfter are already signed in the read request. The server recomputes arg from the complete context and requires exact equality, including path scope and context.register.scope. No secret, key bytes, configuration or context goes in the URL. RPC, if supplied by the implementing owner, takes the identical context and SignedRead values and returns the identical answer; no fabricated session or Summary adapter.

Request budget: combined UTF-8 bytes of Authorization value and X-Artroom-Founding-Context value at most 4,096; ASCII scheme/base64 syntax and raw lengths are checked BEFORE decode/parse. Reject duplicate/combined context values, padded/noncanonical base64, unknown/extra members and noncanonical JSON. Existing Signed decoder's 2,048-character encoded-value bound remains an additional bound; this operation does not enlarge old signed-read headers. Response canonical UTF-8 JSON at most 4,096 bytes; no truncation, pagination or partial offer. Excess request is `forbidden`; excess/incomplete internal result is `unavailable`. Replies use JSON, `Cache-Control: no-store`; never cache eligibility across callers. HTTP answer status is 200 success, 403 forbidden, 409 clock-behind, 501 unsupported-read, 503 unavailable; wrong method is 405/Allow GET and does not return an offer. Client trusts parsed answer shape/bindings, not status alone. No response is signed or sealed as a historical receipt; HTTPS/RPC service identity supplies the ordinary transport boundary.

## Native check and snapshot order

1. Enforce operation/header budgets and exact parse/schema; verify signature by actor over the existing signed-read domain. Require full register kind/ref and explicit pin/context/arg/path match. Invalid input or excluded caller answers generic `forbidden`, without echoing policy, current ref/pin, item, time or another person's data.
2. Resolve only this native register, with an applied active genesis. Wrong incarnation, absent/provisional/refused register, wrong requested pin or unsupported register kind answers `forbidden` without target details. Unknown ABI on an old host is compatibility failure as below. Supported runtime with temporarily unreadable native state answers `unavailable`, never a guessed offer.
3. Read native clock without clamping/writing an entry. If it precedes the previous native entry time, answer `clock-behind`. Require `now < request.notAfter` and remaining lifetime at most `min(60 seconds, actual native intentLifetimeSeconds)`; expired/too-far request is `forbidden`. Success `observed=now` (native timestamp form), `expires=request.notAfter`; these are read observation times, not scope-head position/sealing. Client must reject an already expired answer using its current clock and must not extend it.
4. From ONE current local snapshot, require exactly one open register item. Read its id/revision, pinned definition and immutable policy together. Zero/multiple/inconsistent items or unknown policy yields `unavailable`. Evaluate the SAME native founding-policy predicate for signed actor: open, or keys list contains actor. Excluded actor gets `forbidden`. Only here is the usual recent-signed-entry prerequisite omitted, and only for this read. No cause-chain walk/provider lookup or broader disclosure is needed.
5. Return exactly matched context/actor/arg, item id/revision, eligible:true, own policy mode and observation/expiry. No founders list/other keys, claims/counts/scope head/hash, host/namespace/provider configuration, credentials, raw history or unrelated Summary fields. Emit no native entry/outbox/preparation/token/grant, reserve nothing and call no provider. An ineligible key's forged client remains subject to native unauthorized at `found`.

The successful read does not reserve a handle, make policy mutable, promise actor enrollment or revoke another membership. Current register policy/founders are FIXED; removing a member elsewhere does not remove independent founding eligibility. Do not invent an update-policy/add-founder act for a test.

## Compatibility and client handoff

`founding-offer@1` is a read-ABI capability, not a new native platform-definition alias. A supporting host explicitly implements it for an allowlisted register cohort whose founding policy/item semantics have been reviewed. Initial implementation targets actual main register@2; actual @3 support is separately pinned to the landed manifest cohort and its reviewed directory@3 closure. At this design baseline, @3 is unlanded candidate work and must not be advertised as supported main. Keep historical @1 disabled for this new disclosure unless separately reviewed. Clients request the exact known installed full ref/pin; no `NEWEST`, version guessing or fake Summary fallback.

The capability call itself negotiates the narrow ABI. A conforming supporting host returns the exact capability in success or `unsupported-read`. An old host may answer native 404/405/unknown route or malformed/nonmatching response: the client classifies it as unsupported/unavailable, sends no `found`, and explains that operator/runtime upgrade is required. A generic 404 is not proof the register is absent. No unauthenticated capability endpoint or target catalog is introduced. Same exact schema may support @2/@3 without changing their found admission rules; changing native policy meaning would require separate authority/definition adoption.

Shared-name owner reserves proposed register@4 → directory@4 → membership@3, rules@2, destination@3 and inbox@1 for its combined shared-name/version-label closure. It is held until b8's exact @3 source is independently reviewed/landed and that design is separately adopted; none of it is adopted here. This note allocates NO @4 definition and does not compete with that closure. @4 can be added to this read capability's explicit support table only after that owner's independently reviewed/adopted cohort and a verified unchanged founding-policy/item contract. It is never selected merely because it is numerically newer. Until adoption, @4 is unsupported. Coordinated exact pins/closure and operator provisioned register remain the source of truth.

CLI `claim` initial branch uses a typed offer result to supply `found.expected = {register: offer.item.revision}` under the actual pinned declaration (`also.register` one item), not a synthesized Summary or guessed zero revision. Verify actor/context/arg/full pin/expiry and supported declaration before signing; use the actual register target, exact branch/explicit handle and original privately retained recovery key. Native `found` rechecks revision/incarnation/policy/signature/shape/admission independently. Moving unrelated scope head/adding claims cannot invalidate an unchanged register item revision. If item revision legitimately moves, `revision-moved` is visible; read expiry after saving/sending a found envelope never authorizes replacing that original operation.

Page cold creation entry must precede `roomOf`/selected-member handle. C4/188153 supplies the person's retained signer, explicit founder-handle choice and full operator-provisioned register/pin; no handle borrowed from an unrelated room or account assertion. The offer replaces only the inaccessible initial register read; it supplies no installation/operator authority or child read session. Lost found/seat/first-key responses use C4's original private operation/key/handle/recovery envelopes/accepted facts, receipt checks and locks. Existing Page claim journal and CLI pending claim remain the starting custody code; do not reset unknown work, invent terminal absence or a universal outbox. Pages preset activation needs its separate exact reviewed descriptor and legitimate admin activate/publish/readback before application-ready. Release and two-device/browser recovery remain original owners' duties.

Operator must legitimately provision this caller's eligibility. Current install defaults to an immutable operator-only keys policy and has no ordinary add-founder command. A prospective key needs an explicitly provisioned eligible key policy or an explicitly authorized/adopted operator path to open policy; creation link, invitation elsewhere or site sign-in gives none. Hosting/operator cost, retention and installation authority remain N5/C4/operator owners, not implied public open founding.

## Acceptance after adoption and commission

- Real fresh eligible signer with no session/recent register entry: ordinary Summary remains forbidden, exact bounded offer succeeds, and actual typed native found/seat/key admits one room; reviewed preset readiness is separate. Excluded keys under real immutable keys policy and bypassing clients are respectively forbidden/unauthorized, with no native/provider mutation from the read.
- Full incarnation/pin/context/arg/actor substitution, malformed/signature/header/response oversize, unknown capability/old host, expired/too-far request and native clock-behind refuse without disclosure or client found POST. Removing only the argument check or eligibility check must fail the actual respective witness; no per-field sweep.
- Snapshot id/revision/policy comes from one current native register item; zero/multiple/faulty state is unavailable. A scope-head movement from other claims leaves the same offer revision useful. Current immutable policy cannot be “revoked” by membership changes; any mutable policy test requires its separate adopted native change. Replaced incarnation/pin and stale/faulty offer controls are labelled honestly.
- Delayed response expiry/context change stops initial signing. Saved/sent found/seat/key/preset uncertainty preserves the ORIGINAL operations and answers; queued tab/settings/storage failure does not create another room/key/recovery key or erase unknown proof. Head/ref/revision/pin failures remain distinct from unknown mutation.

Implementation boundaries after exact design/authority approval and planner adoption: contract signed-read name/context/result/arg domain; native register read/object/route plus explicit compatibility table; client HTTP/RPC exact read method and typed initial claim revision path; C4 Page pre-room creation entry/custody; existing first-use/preset/release/acceptance owners. No work above is implemented by this note. Use focused native read/authority/refusal controls and one coordinated implementation gate, then actual hosted cold-person acceptance with setup/help/cost and stand-ins disclosed; no tests ran for this design-only change.

Source evidence: main f6d80 `packages/contract/src/session.ts` SignedRead/domain/argument/header; `packages/client/src/signed-read.ts` signedRead/signedReader and 60-second default; `packages/bytes/src/session.ts` taggedBytes/read-resource separation; `packages/scope/src/signed-reads.ts` exact form/header 2048/arg128/recent-signer/clock checks; `packages/platform/src/register.ts`:87-96 fixed policy,139-168 found also.register/fields,287-299 predicate; `membership.ts`:189-200 handle grammar; `platform/src/versions.ts` immutable pinned meaning; `cli/src/commands.ts`:489-520 initial Summary/expected/private found; `page/src/claim.ts` allowedClaim/full register/current context/private journal; `page/src/main.ts` selected-room claim entry. Full request87d174 and report21f685 were read. @3 and shared-name@4 are qualified candidate/design dependencies, not adopted baseline support.
