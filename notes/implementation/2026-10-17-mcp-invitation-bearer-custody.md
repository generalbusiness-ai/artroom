# MCP invitation and bearer custody guidance

Request `5251ef36`, under `f3ef39dc`; correction `d38a5410`.

The older request described thirty days as a retention limit and every
join as secret-bearing. Current code supports neither universal claim.
The guide now states what is retained and how a launcher can expose the
loopback bearer through its logs. This changes documentation only.

## Evidence from current code

- `packages/client/src/invitation-fields.ts` selects membership@6's
  invitation proof; legacy @1, @2, @4 and @5 use the secret. The proof is
  bound to the membership scope, invitation and joining key.
- `packages/mcp/src/service.ts`, `#join`, uses those fields when signing
  the envelope kept by custody. `step` and `record` expose the admitted
  signed input to an authorized journal reader. A new-cohort proof does
  not make the invitation link public or remove host-retained tool inputs.
- `packages/mcp/src/node.ts` sets terminal archival thresholds of thirty
  days and 1,024 records. A terminal write checks for eligible records,
  skips a record another process holds, and moves the exact serialized
  record into an indexed archive. Archived records remain readable.
  This is not a deletion deadline or an expiry timer. Unresolved records
  stay retained.
- `serveHttp` makes one bearer per process and announces it once on
  standard error by default. The CLI has no alternate bearer-output
  option. A private launcher-to-header handoff is conditional on the
  host keeping both private. The existing stdio transport avoids issuing
  a loopback bearer; host, process and config custody still matter.

- `packages/mcp/src/hosted.ts` uses the same redemption helper for
  `enrol`. The controller recipe now distinguishes the invitation's
  public key and proof in membership@6 from the digest and secret in
  legacy agent-key cohorts @2, @4 and @5. The existing hosted archive
  retention section still applies; this adds no erasure claim.

No runtime, schema, custody record, retention policy, archive writer,
token transport, package or generated asset changes. No deployment,
hosted acceptance or secret-erasure guarantee is claimed.

## Validation and review boundary

This two-path slice starts at Main
`55e1970a5f7a87a9aeeda92542b3e98ad0088a10`, tree
`8125caf09510d3415dd13649e371e07ed289465d`. The document-only
composition was checked against the frozen, passing implementation
`52c1a0fc1e44a604977a95698c8014cf0ab04b7d`, tree
`409b91640dd326d867e2a329be5ffe99b3f72358`, and its final notes
successor `a156b08f1c6169c3a943160440cac122231bdfab`, tree
`3e6340bb0a05dfbfb05771a066a8cd52a274a2fb`.

The original composition check at
`2a52d2c5a3119f4c8bca73b937e1714f7a41941e`, tree
`96b21e2925eb8ea54b978108ddc59d1e511186b4`, found exactly this
guide and this new note changed after `a156b08f`: the other 1,457
existing mode, type and blob leaves agree. Against the gate freeze,
only the guide and five delivery notes differ; all 1,453 other leaves
agree. All thirteen archive leaves match its current final source
`6d1a1973dd5bb361dbe22d4c6b29c223be6c91e6`. The new Custody link
resolves to the existing heading, and whitespace checks pass. This
paragraph is a later note-only addition; final review must retain the
same source correspondence.

Original gate session `49806` exited zero: 1,567 Vitest cases passed,
three existing cases skipped, 16 Node checks and 55 Counting browser
checks passed. This slice changes no source or test. Per
`docs/testing.md`, the gate is not repeated for a document-only successor;
exact path, mode, type and blob correspondence must accompany review.

The separately scoped Source request remains unfulfilled until its
exact-path review and normal landing. Filing and landing follow archive
review `17dad8da`; the passing gate does not approve either source.
