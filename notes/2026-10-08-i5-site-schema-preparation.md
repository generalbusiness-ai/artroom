# Native site declaration schema preparation

This isolated component remains within site request
`a2317893c5728e29cffb14f78439e3ad506fb56a`. Base:
`1d311bf900ff3989d857579fa979a59015cfe660`, branch
`request/i5-site-schema-prep`. The exact design read was
`notes/2026-10-08-i5-site-authority-amendment.md` at
`f60f56054675b4428d3664e3d853053d6de7da2f`, primary artifact
`a5838a697d1ab1fde10336b5456873a7dc5ee905`, independent design review
`afe4d2592eaed59976ef0e7b562bbfc6a654cbec`, and governing adoption
`fbb9143e5a6f3b577f05f0ee3aec68e60e96cd0d`. The later legacy attachment
proposal is outside this component.

`packages/platform/src/site-declarations.ts` implements only the two
adopted native payload shapes and their explicit domains. Both parsers
require raw UTF-8 bytes, the exact domain, a caller-supplied byte budget,
and typed expected full directory/membership/rules/destination references
and stable provider repository identity. No default budget or public policy
exists. Parsing refuses duplicate keys, malformed JSON/UTF-8, noncanonical
bytes, unknown members, substituted realm/provider, unknown audience or
rendering profile, and broader renderer actions. Delegation and pinned
publication/receipt facts must name their declared exact rules/destination
owners. Existing byte/reference/key/digest/time helpers and the platform's
existing Git object-ID helper supply those forms. Repository names and IDs
remain opaque provider text; parsing adds no provider naming policy.

The return value is declaration data, or null. A matching expected context
is not proof that the caller obtained it correctly. Timestamp form does
not establish current expiry, and key/installation bytes do not prove
registration or custody. Fact form and owner equality do not prove causal
admission, current configuration, a published commit or a written receipt.
No route calls this code. No new acts, grants, @3 allocation, registration
trust, ordinary-grant fallback or legacy attachment fields were added.
Native @1/@2 modules, shared rules and catalog entries are unchanged;
the platform index adds only the new declaration exports.

The new single Node witness uses made-up identities and facts. It checks
valid delegation and both configuration variants, then refusals at the
realm/provider, closed policy/profile/field, owner, domain, byte-budget and
canonical-byte boundaries. It proves no scope admission or provider work.
Removing only the exact context comparison made its substituted membership
incarnation assertion fail; the helper reported DISTINGUISHES and restored
the source. The final focused witness passed (one test), and platform source
and test typechecks passed. Raw logs:

- `/tmp/artroom-site-schema-evidence/focused.log`
- `/tmp/artroom-site-schema-evidence/control.log`
- `/tmp/artroom-site-schema-evidence/typecheck.log`

Commands were `npm exec -- vitest run --project platform site-declarations`,
`npm run typecheck --workspace @generalbusiness/artroom-platform`, and
`node scripts/control.mjs` selecting only `test/site-declarations.test.ts`
in the platform package, replacing the exact context comparison with shape
checks. Node was v26.10.0. Existing main dependencies were reused through a
temporary node_modules link; both checkouts' package-lock SHA-256 was
`bd4d9ed101dff266d71008f8a9ac42257093065ab5079cd399e004e40ae3162d`.
No package was installed and the link was removed after checks.

Actual service registration, disjoint dedicated key custody, bounded
retention/operations, transition/concurrency, current-use authority,
provider credential correspondence, publication verification, legacy
transition, integrated gate/review and activation remain owed. No whole
gate, provider, deployment or main landing ran for this isolated component.
