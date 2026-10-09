# Artifacts native-read feasibility

Date: 2026-10-09 (America/New_York). Read-only assessment for planner request `082e4d4b34d03a06f14833374ecc03d98fc299a8`, builder promise `8b7ed05a9e47d830fa8cdc4e73933586ef2b9ca0`.

**Decision: keep the existing bounded smart-HTTP Git reader. No native-read substitution is justified by the evidence inspected.** A native blob-by-OID adapter is the smallest possible later experiment, but request-specific preallocation limits and deployment support remain unproved. Commit and tree metadata cannot supply our general raw-object proof.

This is a design artifact, not implementation, a provider witness, or an adoption decision. No tests, provider API probes, repository/token operations, installs, execution of candidate code, deployments, or source changes were performed. Documentation was fetched from primary sources only. The source read was composed `eac95a6edc7a092264a92dca40e3b9a8c905f4f1`, with main `9d7e4c2777ea8d35441b4a9d79b407cd701065fa`; production `1d7` has no passing gate claim in this assessment.

## Availability and exact interfaces

The [Workers binding documentation](https://developers.cloudflare.com/artifacts/api/workers-binding/) was read on October 9; its page says updated October 1, 2026. It documents disposable repository handles, fresh `info()`, object/file reads and history. It directs consumers to environment-generated types and requires Wrangler 4.145.0 or later for the relevant generation/remote Blob support. That establishes an advertised API, not its availability in our deployment.

Installed `@cloudflare/workers-types` is `5.20260815.1`. Its `index.d.ts:11838–11966` exposes an older `ArtifactsRepo` extending repository metadata with token/fork methods; it lacks native reads and disposal. No generated `worker-configuration.d.ts` was found. Our `packages/scope/src/artifacts-host.ts` structural interface likewise has only `createToken`, `revokeToken`, and `info`. Updating a cast alone would not establish runtime capability.

The separately inspected [current official workerd declaration](https://raw.githubusercontent.com/cloudflare/workerd/main/types/defines/artifacts.d.ts) is a moving `main` file, not a deployed version pin. Its relevant exact signatures are:

```ts
info(): Promise<ArtifactsRepoInfo>;
readBlob(hash: string): Promise<Blob | null>;
readTree(hash: string): Promise<ArtifactsTreeEntry[] | null>;
readCommit(hash: string): Promise<ArtifactsCommitMetadata | null>;
readFile(args: { ref: string; path: string }): Promise<Blob | null>;
log(opts?: { ref?: string; limit?: number; offset?: number }): Promise<ArtifactsCommitMetadata[]>;
// ArtifactsRepo extends Disposable
```

Its commit message removes one trailing newline; metadata lacks raw extra headers/signature bytes and original timezone spelling. Tree names and modes are strings; hashes are lowercase 40-character SHA-1. Blob/file methods can throw `MEMORY_LIMIT` while buffering. None accepts a byte allowance. `info.id` is a unique repository ID; no object-format field is declared. These facts prevent treating decoded metadata as raw objects. This declaration alone does not establish service identity continuity or deployment behavior.

## Capability and decision matrix

The judgments below apply the repository's existing raw-reader contract, rather than assuming a provider projection is equivalent to it.

| Method | Required use | Feasibility and decision |
|---|---|---|
| `readCommit` | Exact raw commit payload, size and OID; authenticated tree/parents before parsing | **Refuse as GitSource replacement.** Metadata cannot reconstruct arbitrary headers, multiline signatures, header order, encoding, timezone or exact trailing bytes. Returned hash is a provider assertion until raw bytes are independently hashed. No caller byte/parent preallocation budget. |
| `readTree` | Exact raw tree payload; raw filename bytes, mode and binary object IDs | **Refuse as general replacement.** String names do not establish arbitrary non-UTF-8 filename fidelity. Mode classification does not authenticate raw serialization. Whole-array return has no caller entry/byte limit. Even an ASCII-only reconstruction needs an explicitly restricted, proven contract; it is not this reader's general contract. |
| `readBlob` | Immutable expected blob OID and raw payload | **Conditional experiment only.** It could preserve BOM, CRLF/LF, NUL and binary data if bytes are returned faithfully and our Git hash matches. Missing/wrong-type `null` is not proof of arbitrary object absence. The caller-specific preallocation requirement is unresolved. |
| `readFile` | File at an authenticated commit/tree path, with accepted type/mode and size | **Do not substitute.** Path resolution returns bytes without a returned tree proof, mode or expected blob OID. A mutable ref is not a captured immutable selection. An exact commit argument still does not prove path correspondence. MIME is presentation, not authority. |
| `log` | Verified history/closure or ref absence | **Do not substitute.** First-parent metadata with a count limit is neither a complete parent/object closure nor a byte budget. An empty unresolved-ref result is not our bounded complete-ref advertisement proof. |
| `info` and disposal | Repository identity and capability lifecycle | **Useful supporting inputs only, after deployment evidence.** Bind actual provider ID and exact configured host/namespace/remote; release handles on every exit. Metadata/default branch does not establish object format, ref selection, publication, token revocation or read authority. |

The documented method behavior, including first-parent history and path-based resolution, is supported by the [binding reference](https://developers.cloudflare.com/artifacts/api/workers-binding/). The refusal judgments are inferences from our source contract. They do not claim provider corruption.

## Byte, identity and allocation requirements

`packages/git/src/reader.ts:31–47,102–105,202–215` requires a `StoredObject` with type, safe size and exact bytes, then verifies SHA-1 over `<type> <size>\0` plus the raw payload before parsing. Tree names remain `Uint8Array`; supported modes include regular, executable, symlink, directory and gitlink. Unknown commit headers can remain authenticated because the hash covers their original bytes; replacing the payload with a reconstructed metadata commit loses that protection. Preserving signature bytes authenticates their object correspondence, not the validity of the signature itself. Text decoding/re-encoding must never precede hash verification.

The current format path authenticates a complete smart-HTTP advertisement and rejects a non-SHA-1 `object-format` capability. No inspected native metadata field replaces that check. A 40-character input does not prove every object or repository uses that format. A later native slice must remain SHA-1-only unless a separately adopted format contract changes the whole proof.

`SmartHttpSource` limits wire, inflated and retained bytes; it checks declared pack/delta sizes before allocation, object counts, pack trailer and object hashes. Site narrows reads to at most 16 MiB transport bytes, 1 MiB commit, 8 MiB tree, 1 MiB plus one blob byte, and 4096 objects/refs (`site/host.ts:164–178`). An untrusted declared length cannot replace counted bytes. Complete ref enumeration is required before absence.

Cloudflare publishes a [32 MB maximum file/blob and 1 GB repository limit](https://developers.cloudflare.com/artifacts/platform/limits/). That is a coarse storage ceiling, not our 1 MiB caller allowance, a tree-entry bound, or proof of RPC/Worker allocation behavior. `Blob.size` is available only **after** native return. Rejecting it before `arrayBuffer()` can bound the adapter's extra copy, but not earlier service/RPC buffering. Counting `Blob.stream()` chunks also cannot retroactively bound that buffering. Heap or timing observations from a small successful read cannot prove a provider-internal allocation ceiling.

Current Artifacts code records `repository.id = name` and validates `id === name`; both `ArtifactsProvider` and Site then check the reported remote. The new unique-ID API cannot silently repair historical records. Before adoption, decide how an existing recorded repository maps to the provider's actual ID and how deletion/recreation under the same name is refused. Host, namespace and remote/name equality alone are not stable repository identity. An identity mismatch remains unavailable, never a fallback to another repository.

## Authority, publication and recovery remain separate

1. **Mutable ref observation** says what a provider reports now. It needs its own completeness and capture semantics; it does not select an immutable published version.
2. **Immutable object verification** proves that raw bytes match a selected OID in the selected repository. It does not prove membership authority or that the room published that object.
3. **Authorization and publication** come from native facts. Site's A1 proof binds the destination incarnation/head, directory/repository, judged publication, written receipt FactRefs and expected receipt ref/commit/tree/blob/file. `site/route.ts:375–382` then verifies fetched receipt correspondence. It checks selected identity/type/path/size before a 304. Native `readFile`/`log` cannot bypass these checks.
4. **N1 retained source** binds the exact manifest/source opening FactRefs, hashes, full scope incarnation, signed input, actor/grant, supported definition and file base/path/digest/UTF-8 size/content (`retained-editor-data.ts:34–67`). Provider bytes or HEAD do not replace that retained-source proof or grant edit authority.

`ArtifactsProvider.#read` currently mints a scoped read token with a reported expiry, performs bounded HTTP, then attempts revocation. Site follows that lifecycle too. Those are real provider mutations even when the requested operation is a read. `artifacts-wiring.ts:97` consequently does not expose those reads as unrestricted recovery; its actual recovery exception is `check-judge`. The proposed native-read surface must not silently change that rule or remove declared mint/revoke effects.

`credential-store.ts` retains exact mint/attempt metadata, distinguishes dropped plaintext from revocation, and records revocation only explicitly. `operations.ts` preserves unknown sends and accepts exact retained own replies without re-sending the original mutation. The gateway's durable forwarding mark similarly separates not-sent from unknown. Disposal releases an RPC capability; it is not token revocation, credential cleanup or settlement of an unknown operation. TTL, an absent token listing, and a successful later read are not automatic cleanup proof. No factory, recovery, cache, push or delegation adoption is proposed here.

The source-derived **seven sessions / eleven HTTP calls** description is an input for identifying repeated work, not a measured production latency, throughput or cost result. This assessment has no benchmark or live provider comparison.

## Smallest later slice and exact missing evidence

A blob-only candidate would accept an already authenticated expected blob OID and exact repository binding, keep the existing raw commit/tree/ref proof, read bytes without text conversion, enforce safe size/count limits, compute the Git blob OID itself, and return no bytes on mismatch. It must preserve unavailable versus proven absence and must not mint a replacement credential after an unknown attempt. Unsupported or unproved capability uses the existing bounded HTTP path; unavailable HTTP yields the existing refusal. No metadata-to-raw synthesis and no automatic backend fallback after an identity mismatch.

Before code adoption, the owner needs all of the following:

- Environment-pinned generated binding types, compatibility/runtime version and evidence that those exact methods exist; no dependency edit or type generation was done for this report.
- A documented or inspectable enforced preallocation contract for the RPC blob read: caller numeric limit/length-only bounded fetch, or an explicitly adopted coarse memory budget with justified finite buffering. Current signatures are insufficient.
- Exact-byte fidelity evidence for blobs and OID verification, including BOM and mixed line endings; documented error/type/missing behavior must match the adapter's distinctions.
- A stable provider-ID mapping for recorded repositories, deletion/recreation behavior and capability disposal semantics. No new record identity may be inferred from a name alone.
- An explicit owner decision about any session/token effect change, with unknown and late-reply custody preserved. Native API availability alone does not authorize it.

## One bounded future external witness, not executed

After the above allocation/identity decisions, commission **one blob-fidelity witness** against one explicitly authorized, pre-populated temporary operator-owned Artifacts repository. Record the environment/types/source pins and nonsecret repository ID/namespace/remote before starting. A local fixture manifest supplies exact raw Git payloads and SHA-1 OIDs independently of provider metadata.

Use three blobs only: a 16 KiB binary payload containing a BOM, CRLF/LF, NUL and all byte values; an empty blob; and a 65,537-byte payload above a deliberately chosen 64 KiB adapter allowance. Total fixture blob bytes stay below 82 KiB. Use one capability, two `info` calls and at most five `readBlob` calls (three fixture OIDs, one known commit OID for wrong type, one deliberately unused valid OID for the null-result case); no retries and a 30-second overall abort. A null result does not establish complete repository/object absence. Dispose on all exits. Capture fixed reasons, size and computed OIDs, no tokens or raw private content. Oversized rejection must occur before adapter copying/retention. This tests fidelity and adapter handling, **not** provider-internal allocation; the separate contract remains mandatory.

The fixture may include a raw commit with extra/multiline signature headers and noncanonical timezone/message bytes plus a tree with executable/symlink/gitlink and non-UTF-8 names, but this witness does not call metadata APIs or claim their fidelity. Existing raw HTTP verifies those anchors; native blob comparison stays bounded. No repository creation, push, credential mint/revoke, deployment, cleanup operation or public release is implicitly authorized by this plan. Any fixture provisioning/cleanup is a separately recorded operator step; unresolved outcomes remain named duties.

## Source coverage and disposition

Read: `packages/scope/src/artifacts-host.ts`, `artifacts-wiring.ts`, `credential-store.ts`, relevant `operations.ts` and `destination-host.ts` boundaries; `packages/git/src/reader.ts`, `http-read.ts`, `gateway.ts`; `packages/scope/src/site/host.ts`, `publication.ts`, `route.ts`; `packages/page/src/retained-editor-data.ts`; installed Workers declaration; related hosts/pages/protocol documentation. Official primary references were the binding, workerd declaration, limits, [Git protocol](https://developers.cloudflare.com/artifacts/api/git-protocol/) and [REST API](https://developers.cloudflare.com/artifacts/api/rest-api/) pages. REST's raw-file route is path resolution, not a raw commit/tree endpoint, and its control-plane credentials are distinct from Git repo tokens; no new REST credential path is proposed.

Root can file this noGit artifact under the named promise. Safe next decision: retain bounded HTTP now; request the missing deployment/allocation/identity contract before commissioning the single native blob witness. No full native reader feasibility or production readiness is claimed.
