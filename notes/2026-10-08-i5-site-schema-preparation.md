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

## c4 native authority-field follow-up

2026-10-08, same site owner and preparation branch, from exact parser head
`e8a9422d99f3a7e0792441f3ede0f82262548a8b`. Complete successor DESIGN
`c4a17ee0d62529a8d8ba574ef6e8a6242effb737` was independently approved in
`5222bc6f42a33c0ed5134d86b3c8e3c659fa99f3` and adopted by
`e5437627fd3dd8ccf38d797fc3c917d397d30ada`; both records were read in full.
That successor now governs this parser's native canonical payloads. The
earlier f60 preparation and checks above remain historical evidence.

Both payloads now require explicit `authority`, a complete rules ScopeRef
equal to the caller's expected `context.rules`. Missing authority is not
inferred from another field or accepted as old payload bytes. A substituted
incarnation, another owner kind or unsupported legacy `site` authority is
refused. Declaration domains stay unchanged: these schemas were never
shipped, and no domain/identity allocation is silently added. The native
parser does not accept, fabricate or reinterpret unsupported attachment
kinds. Native modules, catalog entries and @3 allocations are untouched.

The existing one compact Node witness now includes required/substituted
authority in both delegation and configuration, and unsupported attachment
authority alongside its earlier exact realm/provider and canonical-byte
cases. These remain made-up declarations/facts, not an actual current
binding, grant, factory birth or renderer credential proof. The returned
data does not establish that a rules authority was legitimately selected;
the caller's real context, authenticated current slot and use gates remain
separate required implementation work. No route or registration calls it.

### Viewer/controller clarification

For a members-only site, a plain viewer needs current active member/key
eligibility and the exact-room session/birth/current-selection checks, not
`rules.publish` or a controller role. Controller/issuer permission governs
configuration, delegation and recovery/disable separately. For a native
agent identity, existing controller-liveness eligibility applies only where
the actual interpreted membership model already requires it; it is not a
new publisher permission for ordinary viewers. No v1 session shape,
issuance, serving or recall semantics change in this data-only component.
Final factory/service signed wire, registration/borrowing and executor
interfaces remain named owner inputs before their implementation/enablement.

### Focused checks and original raw logs

Commands, run in `/tmp/artroom-site-schema-prep`:

```
./node_modules/.bin/vitest run --project platform test/site-declarations.test.ts --reporter verbose > /tmp/artroom-site-schema-authority-evidence/focused.log 2>&1
npm run typecheck --workspace @generalbusiness/artroom-platform > /tmp/artroom-site-schema-authority-evidence/typecheck.log 2>&1
node scripts/control.mjs packages/platform/src/site-declarations.ts ' && same(value["authority"], expected.rules)' '' --expect 'site declarations require exact realm/provider' -- packages/platform test/site-declarations.test.ts > /tmp/artroom-site-schema-authority-evidence/control.log 2>&1
```

The focused witness passed (one test, Vitest duration 0.250 s). Platform
source/test typechecks passed. Removing only authority-to-context equality
made the same witness's substituted rules-incarnation assertion fail; the
control reported **DISTINGUISHES** and restored the source. No other guard
was removed and no test expectation changed for the control.

These are original combined stdout/stderr files saved during the commands,
not reconstructed transcript excerpts. The helper's temporary Vitest JSON
was removed on exit as usual; its raw printed assertion/result remains in
control.log. The logs contain only made-up nonsecret declaration identities,
not private keys, invitations, provider plaintexts or live repository data.

| Raw log | Bytes | SHA-256 |
|---|---:|---|
| `/tmp/artroom-site-schema-authority-evidence/focused.log` | 365 | `738806009926f2f6c866be60fe8da43a1b7b3e0ca0f6f241a67519c80df5c2fb` |
| `/tmp/artroom-site-schema-authority-evidence/typecheck.log` | 112 | `7164e781f55f730d5b11f99c10513168239de3ff338d0315651cb93b32fe3130` |
| `/tmp/artroom-site-schema-authority-evidence/control.log` | 3299 | `e10efd55fae47129de00cc3f44132c76f9362b718c241ae5b4f36bd378a21eb4` |

Node was v26.10.0. Existing main dependencies were reused through a temporary
node_modules link; both lockfiles again had SHA-256
`bd4d9ed101dff266d71008f8a9ac42257093065ab5079cd399e004e40ae3162d`.
Main reference measured `1eed91aacac56649ac0b75c0652215b0418eeff8`; no main
file or installed package was changed. The temporary link was removed after
the checks. No whole suite/gate, provider, route, activation or allocation
ran. Complete source integration/review and full-site obligations remain open.
