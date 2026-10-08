# Semantic bundle parser preparation

This is source preparation within requests `48407a70e3083e8ef396db347e064b2cd6e9879f`
and `9be26ef7e1a4aac138bc0637d7ed121e26fcd105`, following adopted design
`b74cb9c1ed8dab2f04d8282e20f025e85c32d05b` / `0bc05e07e67049b8d76c8f3dfb6b1d7e64109423`.
Exact source head is `56df3fb3a3e3fd0b52a58cb8d6ce6903e0b4fe50`, tree
`f44a28ffbd7a68c6e33be22fd9a324f95fd323a0`, from base
`1eed91aacac56649ac0b75c0652215b0418eeff8`. This successor adds only this note
and [the evidence manifest](2026-10-08-i5-bundle-parser-evidence.json).

## Source and boundaries

| Path | Preparation |
|---|---|
| `packages/contract/src/semantic-bundle.ts` | All 46 adopted record/union variants; data types only. |
| `packages/contract/src/index.ts` | Type exports; preserves existing CapabilityRecord through a distinct bundle alias. |
| `packages/bytes/src/semantic-content.ts` | Six exact domain-newline-canonical framings and content IDs. |
| `packages/bytes/src/index.ts` | Framing exports. |
| `packages/derive/src/bundle-records.ts` | Bounded canonical/closed parsing and separate Ed25519 envelope/two-key rotation checks. |
| `packages/derive/src/bundle-closure.ts` | Raw content, declared module/artifact graph and cross-record checks. |
| `packages/derive/src/index.ts` | Pure preparation exports. |
| `packages/derive/test/bundle.test.ts` | Four compact Node witnesses using made-up data. |

`BundleArtifact.ref` accepts exact canonical ArtifactRef metadata bytes, not a
host object. The existing closed parser applies caller byte/token/record/depth
limits before decoding/parsing. All adopted ArtifactRef values remain
representable. Fields a caller serialized away are not asserted validated.
No unbounded host-key reflection or caller verification flag remains.

Typed semantic references require their exact adopted domain-derived ID.
ArtifactRefs and raw admission/runtime/compatibility IDs use raw lookup.
The inspection root accepts either namespace only when unambiguous; distinct
raw and typed objects matching the same root produce a deterministic conflict.
Frozen `3771ddbb`, `3c9b0e3f` and `522167cd` remain as predecessors; their
metadata/API defects were repaired rather than their review subjects rewritten.

These outputs establish only syntax, declared content correspondence or
separate cryptographic signature correctness. The definition digest check
supports the current `artroom-definition-1` subset, not generic historical
ABI/domain proof. Module cycles are descriptive; foreign proof contexts remain
separate causal obligations. No historical entry-schema interpreter, actual
executable/import/ABI correspondence, configured trust, admitted selection or
current generation/Store/executor proof follows. Full refused-genesis and legacy
execution, original resources/late answers/cleanup and the existing operator
71b handoff remain owed. No current runtime/replay selector or access authority
was changed; no loader, network/dynamic imports or default quota was added.

## Retained checks

The focused command was `./node_modules/.bin/vitest run --project derive
packages/derive/test/bundle.test.ts`. The type command was `npm run typecheck
--workspace @generalbusiness/artroom-contract --workspace
@generalbusiness/artroom-bytes --workspace @generalbusiness/artroom-derive`.
The manifest retains exact commands/argv, result attribution, byte counts and
SHA-256 hashes for all 17 original redirected logs. Intermediate uncommitted
source snapshots were not saved; their logs are not exact-head rerun evidence.
The initial type failure and repaired runs remain recorded.

For predecessor source25, the existing helper's unchanged four-test baseline passed;
removing only the predecode byte bound failed the metadata closure assertion,
reported DISTINGUISHES and restored the source. The three workspace typechecks
passed. Original final logs are `/tmp/artroom-bundle-reference-bytes-evidence/control-metadata-bound.log`
and `/tmp/artroom-bundle-reference-bytes-evidence/types.log`.
Earlier controls distinguish omitted component closure, raw-as-typed domain
identity and the superseded reflected-metadata bound; their exact attribution
and restored-source results remain in the manifest.

Existing installed dependencies and isolated workspace links were reused; no
package or lock change/install was made. The evidence-only documentation successor after the source repair reruns
nothing. No gate, provider, acquisition, activation or main landing occurred.
Ordinary source review and all original integrated obligations remain separate.

## Publication continuity

The parser evidence is now published on its own evidence-only promise rather
than the ordered clone implementation promise. This note-only successor keeps
all source and raw evidence unchanged; it adds no test or review credit.

## Separate-index repair

Planner finding `2036b29f05c228f10860b05cc78da386f0515a14` was read in full.
The exact tag/newline/canonical payload framing bytes can legitimately have a
raw ArtifactId equal to the semantic record's typed ContentId, without a hash
collision. The former shared map made input order overwrite/select a root or
produce a conflict. Raw and typed indexes are now separate. Kind-specific
semantic edges use the required namespace; exact raw ArtifactRef matching is
unchanged. The existing unqualified root refuses distinct-object ambiguity in
both insertion orders, with no new mode API and no ban on retaining framing
material.

The existing identity witness now shows typed-edge success and ambiguous-root
refusal for both orders. Its unchanged four-test baseline passed; removing only
the root ambiguity guard produced the expected assertion failure and
DISTINGUISHES. The helper restored the source, then the three workspace
typechecks passed. Exact commands and original logs under
`/tmp/artroom-bundle-index-repair-evidence` are retained in the manifest.
Frozen `d444f79a144fdfb7f7a82aba379af68281f38f4a` and all earlier source/log
attribution remain intact. This is declared-data inspection correctness;
all historical execution, trust/admission and integrated obligations above
remain held. No matrix, history generator, gate or acquisition ran.
