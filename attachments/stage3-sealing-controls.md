# Stage 3 shared Room sealing controls

Exact head: 26872bac08efb220d90ee218ac31a4034b90e98e. Reviewer: checker. Original scopes: Stage 3 1e8fee4b/3af8ebc7 and shared Stage 2 fd6f00b6/c96e88fc. This is supporting evidence, not a verdict.

All 36 invitation artifact paths were individually checked by the evidence reviewer; root independently recomputed their byte counts, SHA256 and Git blob IDs from the exact head. All matched. The included artifact-identities.json records the complete set.

The owned fixture is /tmp/artroom-checker-stage3-26872-control-6Qkoc4/fixture, a detached checkout at the exact head. External installed dependencies are reused without installation, with all ten workspace aliases pointing to the owned fixture. Vitest 4.1.11 and @cloudflare/vitest-pool-workers 0.22.0 run real workerd/SQLite Room witnesses. The unchanged shipped scripts/control.mjs is used with a no-install npx wrapper solely to retain each raw result before the control removes its temporary reports.

| Control | Exact source change | Baseline | Fault | Result |
|---|---|---|---|---|
| Land sealing | if (!still()) { → if (false && !still()) { | 1 pass, 59 unselected | 0 pass, 1 AssertionError, 59 unselected | DISTINGUISHES, control exit 0 |
| Carry sealing | if (runner && digestJson(read()) !== digestJson(on)) { → if (false && runner && digestJson(read()) !== digestJson(on)) { | 1 pass, 59 unselected | 0 pass, 1 AssertionError, 59 unselected | DISTINGUISHES, control exit 0 |

Land witness: acts.test.ts:796–814, revocation admitted during held reservation evaluation. Fault fails :811 because one stale land-evaluated event is present rather than zero. Carry witness: acts.test.ts:1054–1083, checker's key revoked during held carry evaluation. Fault fails :1080 because the sealed event says carried=true rather than false; baseline seals the later key-compromised noncarry. Neither failure is a timeout, unloaded file, import/type failure or ordinary throw. Root read all four JSON reports and the actual assertion messages.

Both controls restored packages/room/src/core.ts byte-for-byte: SHA256 2918c8e08b0d9a62e5364d4bcbe873e3d095200084f902203b9344f71c760343. before-core.ts and the two one-change source variants are retained. Controls took 4.781 and 4.478 seconds respectively, diagnostic wall time only, not an overhead benchmark.

Limits: this independently verifies these two held-revocation boundaries, not all eight builder-reported controls, the entire Stage 2 or Stage 3 suite, published-log replay for these witnesses, or complete carry accounting. No full gate, install, provider operation or production source edit was performed. Complete original condition 2 and its independently anchored repeated-pass/terminal grammar remain owed; the legacy whole-verifier negative recovery witness remains owed. The probe concerning eligibility changed by recomputation during a held carry is separately in progress. Retiring an invitation does not turn this evidence into a verdict; a fresh live review binding is required before filing.
