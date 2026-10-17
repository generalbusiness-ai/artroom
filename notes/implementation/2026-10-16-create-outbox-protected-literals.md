# Preserved terminology literals

These are explicit old data values, not API aliases. No new definition
or wire version is introduced by this change. The named next versions
are the proposed homes of a later wording change, not approved releases.
Old journals, signatures, object IDs and retained recovery requests keep
their existing bytes and readers.

All 36 platform data values, catalog names and defaults compare exactly
with the pre-rename baseline. The canonical data has 304 occurrences of
the nine native names across 30 versions; shared source rows below can
supply several of those versions. Entry-v1 genesis and retained custody
have separate version boundaries.

## Production data keys and their readers

Repeated occurrences on one source line are counted. Paths and line
numbers name the current source; definitions and their readers are both
listed so the boundary is reviewable.

| Source | Literal | Occurrences | Later version or boundary |
|---|---|---:|---|
| [apps/room/page/src/claim.ts:159](../../apps/room/page/src/claim.ts#L159) | `founders` | 1 | register@12 |
| [apps/room/page/src/start-custody.ts:8](../../apps/room/page/src/start-custody.ts#L8) | `@founder` | 1 | Start custody schema 2; new starts only; retain old handle identity |
| [apps/room/page/src/start-custody.ts:9](../../apps/room/page/src/start-custody.ts#L9) | `@founder` | 1 | Start custody schema 2; new starts only; retain old handle identity |
| [apps/room/page/src/start-custody.ts:17](../../apps/room/page/src/start-custody.ts#L17) | `@founder` | 1 | Start custody schema 2; new starts only; retain old handle identity |
| [apps/room/page/src/start-custody.ts:33](../../apps/room/page/src/start-custody.ts#L33) | `@founder` | 1 | Start custody schema 2; new starts only; retain old handle identity |
| [apps/room/page/src/start-custody.ts:82](../../apps/room/page/src/start-custody.ts#L82) | `@founder` | 1 | Start custody schema 2; new starts only; retain old handle identity |
| [apps/room/page/src/view.ts:205](../../apps/room/page/src/view.ts#L205) | `founding-key` | 1 | membership@7 |
| [apps/room/page/src/view.ts:205](../../apps/room/page/src/view.ts#L205) | `founding-policy` | 1 | register@12 |
| [packages/bytes/src/records.ts:249](../../packages/bytes/src/records.ts#L249) | `founding` | 1 | Entry wire version 2; keep Entry-v1 readers |
| [packages/cli/src/commands.ts:319](../../packages/cli/src/commands.ts#L319) | `founding-key` | 1 | membership@7 |
| [packages/cli/src/commands.ts:319](../../packages/cli/src/commands.ts#L319) | `founding-policy` | 1 | register@12 |
| [packages/cli/src/commands.ts:410](../../packages/cli/src/commands.ts#L410) | `founders` | 1 | register@12 |
| [packages/cli/src/commands.ts:428](../../packages/cli/src/commands.ts#L428) | `founding` | 3 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:454](../../packages/cli/src/commands.ts#L454) | `founding` | 2 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:455](../../packages/cli/src/commands.ts#L455) | `founding` | 3 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:456](../../packages/cli/src/commands.ts#L456) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:457](../../packages/cli/src/commands.ts#L457) | `founding` | 2 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:458](../../packages/cli/src/commands.ts#L458) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:459](../../packages/cli/src/commands.ts#L459) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:460](../../packages/cli/src/commands.ts#L460) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:476](../../packages/cli/src/commands.ts#L476) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:481](../../packages/cli/src/commands.ts#L481) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:483](../../packages/cli/src/commands.ts#L483) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:484](../../packages/cli/src/commands.ts#L484) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:504](../../packages/cli/src/commands.ts#L504) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:535](../../packages/cli/src/commands.ts#L535) | `founding` | 2 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:536](../../packages/cli/src/commands.ts#L536) | `founding` | 3 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:537](../../packages/cli/src/commands.ts#L537) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:538](../../packages/cli/src/commands.ts#L538) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:540](../../packages/cli/src/commands.ts#L540) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:541](../../packages/cli/src/commands.ts#L541) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:547](../../packages/cli/src/commands.ts#L547) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:549](../../packages/cli/src/commands.ts#L549) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:554](../../packages/cli/src/commands.ts#L554) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:571](../../packages/cli/src/commands.ts#L571) | `founding` | 1 | CLI custody schema 2 |
| [packages/cli/src/commands.ts:612](../../packages/cli/src/commands.ts#L612) | `foundingHandle` | 1 | membership@7 |
| [packages/cli/src/commands.ts:612](../../packages/cli/src/commands.ts#L612) | `foundingKey` | 1 | membership@7 |
| [packages/cli/src/commands.ts:669](../../packages/cli/src/commands.ts#L669) | `found` | 5 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/commands.ts:669](../../packages/cli/src/commands.ts#L669) | `founderHandle` | 1 | register@12, directory@11, membership@7 and destination@7 for the carried native fields |
| [packages/cli/src/commands.ts:680](../../packages/cli/src/commands.ts#L680) | `@founder` | 1 | Start custody schema 2; new starts only; retain old handle identity |
| [packages/cli/src/commands.ts:696](../../packages/cli/src/commands.ts#L696) | `founderHandle` | 1 | register@12, directory@11, membership@7 and destination@7 for the carried native fields |
| [packages/cli/src/commands.ts:697](../../packages/cli/src/commands.ts#L697) | `found` | 2 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/commands.ts:698](../../packages/cli/src/commands.ts#L698) | `found` | 1 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/commands.ts:702](../../packages/cli/src/commands.ts#L702) | `found` | 1 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/commands.ts:727](../../packages/cli/src/commands.ts#L727) | `found` | 1 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/commands.ts:727](../../packages/cli/src/commands.ts#L727) | `founderHandle` | 1 | register@12, directory@11, membership@7 and destination@7 for the carried native fields |
| [packages/cli/src/commands.ts:732](../../packages/cli/src/commands.ts#L732) | `found` | 1 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/commands.ts:738](../../packages/cli/src/commands.ts#L738) | `found` | 1 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/commands.ts:743](../../packages/cli/src/commands.ts#L743) | `found` | 1 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/commands.ts:750](../../packages/cli/src/commands.ts#L750) | `found` | 1 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/commands.ts:752](../../packages/cli/src/commands.ts#L752) | `found` | 1 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/commands.ts:757](../../packages/cli/src/commands.ts#L757) | `found` | 1 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/commands.ts:763](../../packages/cli/src/commands.ts#L763) | `found` | 1 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/commands.ts:764](../../packages/cli/src/commands.ts#L764) | `found` | 1 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/commands.ts:767](../../packages/cli/src/commands.ts#L767) | `found` | 2 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/store.ts:36](../../packages/cli/src/store.ts#L36) | `found` | 1 | register@12 for act kind; CLI custody schema 2 for saved claim key |
| [packages/cli/src/store.ts:65](../../packages/cli/src/store.ts#L65) | `founding` | 1 | CLI custody schema 2 |
| [packages/contract/src/entry.ts:52](../../packages/contract/src/entry.ts#L52) | `founding` | 1 | Entry wire version 2; keep Entry-v1 readers |
| [packages/derive/src/genesis.ts:124](../../packages/derive/src/genesis.ts#L124) | `found` | 1 | Entry wire version 2 for the legacy root-intent kind |
| [packages/derive/src/genesis.ts:147](../../packages/derive/src/genesis.ts#L147) | `founding` | 1 | Entry wire version 2; keep Entry-v1 readers |
| [packages/derive/src/genesis.ts:178](../../packages/derive/src/genesis.ts#L178) | `founding` | 1 | Entry wire version 2; keep Entry-v1 readers |
| [packages/derive/src/handlers.ts:120](../../packages/derive/src/handlers.ts#L120) | `founding` | 2 | Entry wire version 2; keep Entry-v1 readers |
| [packages/derive/src/handlers.ts:197](../../packages/derive/src/handlers.ts#L197) | `founding` | 2 | Entry wire version 2; keep Entry-v1 readers |
| [packages/derive/src/handlers.ts:492](../../packages/derive/src/handlers.ts#L492) | `founding` | 1 | Entry wire version 2; keep Entry-v1 readers |
| [packages/derive/src/marks.ts:46](../../packages/derive/src/marks.ts#L46) | `founding` | 1 | Entry wire version 2; keep Entry-v1 readers |
| [packages/derive/src/operand.ts:158](../../packages/derive/src/operand.ts#L158) | `founding` | 2 | Entry wire version 2; keep Entry-v1 readers |
| [packages/derive/src/operand.ts:183](../../packages/derive/src/operand.ts#L183) | `founding` | 2 | Entry wire version 2; keep Entry-v1 readers |
| [packages/mcp/src/marks.ts:20](../../packages/mcp/src/marks.ts#L20) | `founding-policy` | 1 | register@12 |
| [packages/mcp/src/marks.ts:30](../../packages/mcp/src/marks.ts#L30) | `founding-key` | 1 | membership@7 |
| [packages/mcp/src/service.ts:814](../../packages/mcp/src/service.ts#L814) | `found` | 1 | Entry wire version 2 for the legacy root-intent kind |
| [packages/platform/src/demo-register.ts:27](../../packages/platform/src/demo-register.ts#L27) | `founding` | 1 | Entry wire version 2; keep Entry-v1 readers |
| [packages/platform/src/demo-register.ts:28](../../packages/platform/src/demo-register.ts#L28) | `founding` | 1 | Entry wire version 2; keep Entry-v1 readers |
| [packages/platform/src/demo-register.ts:29](../../packages/platform/src/demo-register.ts#L29) | `founders` | 1 | register@12 |
| [packages/platform/src/destination.ts:128](../../packages/platform/src/destination.ts#L128) | `found` | 1 | destination@7 |
| [packages/platform/src/destination.ts:504](../../packages/platform/src/destination.ts#L504) | `founderHandle` | 1 | destination@7 |
| [packages/platform/src/destination.ts:512](../../packages/platform/src/destination.ts#L512) | `founderHandle` | 1 | destination@7 |
| [packages/platform/src/destination.ts:514](../../packages/platform/src/destination.ts#L514) | `founderHandle` | 2 | destination@7 |
| [packages/platform/src/destination.ts:1141](../../packages/platform/src/destination.ts#L1141) | `founderHandle` | 1 | destination@7 |
| [packages/platform/src/directory.ts:104](../../packages/platform/src/directory.ts#L104) | `found` | 1 | directory@11; children membership@7 and destination@7 |
| [packages/platform/src/directory.ts:181](../../packages/platform/src/directory.ts#L181) | `founder` | 1 | directory@11; children membership@7 and destination@7 |
| [packages/platform/src/directory.ts:182](../../packages/platform/src/directory.ts#L182) | `founderHandle` | 1 | directory@11; children membership@7 and destination@7 |
| [packages/platform/src/directory.ts:238](../../packages/platform/src/directory.ts#L238) | `founderHandle` | 1 | directory@11; children membership@7 and destination@7 |
| [packages/platform/src/directory.ts:250](../../packages/platform/src/directory.ts#L250) | `founder` | 2 | directory@11; children membership@7 and destination@7 |
| [packages/platform/src/directory.ts:251](../../packages/platform/src/directory.ts#L251) | `founderHandle` | 2 | directory@11; children membership@7 and destination@7 |
| [packages/platform/src/directory.ts:261](../../packages/platform/src/directory.ts#L261) | `founder` | 2 | directory@11; children membership@7 and destination@7 |
| [packages/platform/src/directory.ts:261](../../packages/platform/src/directory.ts#L261) | `founderHandle` | 2 | directory@11; children membership@7 and destination@7 |
| [packages/platform/src/directory.ts:798](../../packages/platform/src/directory.ts#L798) | `founderHandle` | 2 | directory@11; children membership@7 and destination@7 |
| [packages/platform/src/membership.ts:231](../../packages/platform/src/membership.ts#L231) | `foundingKey` | 1 | membership@7 |
| [packages/platform/src/membership.ts:232](../../packages/platform/src/membership.ts#L232) | `foundingHandle` | 1 | membership@7 |
| [packages/platform/src/membership.ts:282](../../packages/platform/src/membership.ts#L282) | `founder` | 1 | membership@7 |
| [packages/platform/src/membership.ts:283](../../packages/platform/src/membership.ts#L283) | `founderHandle` | 1 | membership@7 |
| [packages/platform/src/membership.ts:289](../../packages/platform/src/membership.ts#L289) | `founder` | 1 | membership@7 |
| [packages/platform/src/membership.ts:289](../../packages/platform/src/membership.ts#L289) | `foundingKey` | 1 | membership@7 |
| [packages/platform/src/membership.ts:290](../../packages/platform/src/membership.ts#L290) | `founderHandle` | 1 | membership@7 |
| [packages/platform/src/membership.ts:290](../../packages/platform/src/membership.ts#L290) | `foundingHandle` | 1 | membership@7 |
| [packages/platform/src/membership.ts:302](../../packages/platform/src/membership.ts#L302) | `founding-key` | 1 | membership@7 |
| [packages/platform/src/membership.ts:308](../../packages/platform/src/membership.ts#L308) | `foundingHandle` | 1 | membership@7 |
| [packages/platform/src/membership.ts:320](../../packages/platform/src/membership.ts#L320) | `founding-key` | 1 | membership@7 |
| [packages/platform/src/membership.ts:326](../../packages/platform/src/membership.ts#L326) | `foundingHandle` | 1 | membership@7 |
| [packages/platform/src/membership.ts:330](../../packages/platform/src/membership.ts#L330) | `foundingKey` | 1 | membership@7 |
| [packages/platform/src/membership.ts:614](../../packages/platform/src/membership.ts#L614) | `founding-key` | 1 | membership@7 |
| [packages/platform/src/membership.ts:616](../../packages/platform/src/membership.ts#L616) | `foundingKey` | 1 | membership@7 |
| [packages/platform/src/membership.ts:729](../../packages/platform/src/membership.ts#L729) | `foundingHandle` | 1 | membership@7 |
| [packages/platform/src/register.ts:94](../../packages/platform/src/register.ts#L94) | `founders` | 1 | register@12 |
| [packages/platform/src/register.ts:109](../../packages/platform/src/register.ts#L109) | `founder` | 1 | register@12; matching directory@11 |
| [packages/platform/src/register.ts:126](../../packages/platform/src/register.ts#L126) | `founders` | 1 | register@12 |
| [packages/platform/src/register.ts:133](../../packages/platform/src/register.ts#L133) | `founders` | 2 | register@12 |
| [packages/platform/src/register.ts:141](../../packages/platform/src/register.ts#L141) | `found` | 1 | register@12; matching directory@11 |
| [packages/platform/src/register.ts:142](../../packages/platform/src/register.ts#L142) | `founding-policy` | 1 | register@12 |
| [packages/platform/src/register.ts:146](../../packages/platform/src/register.ts#L146) | `founderHandle` | 1 | register@12; matching directory@11 |
| [packages/platform/src/register.ts:158](../../packages/platform/src/register.ts#L158) | `founder-key` | 1 | register@12 |
| [packages/platform/src/register.ts:283](../../packages/platform/src/register.ts#L283) | `founding` | 2 | Entry wire version 2; keep Entry-v1 readers |
| [packages/platform/src/register.ts:291](../../packages/platform/src/register.ts#L291) | `founding-policy` | 1 | register@12 |
| [packages/platform/src/register.ts:295](../../packages/platform/src/register.ts#L295) | `founders` | 1 | register@12 |
| [packages/platform/src/register.ts:306](../../packages/platform/src/register.ts#L306) | `founderHandle` | 1 | register@12; matching directory@11 |
| [packages/platform/src/register.ts:308](../../packages/platform/src/register.ts#L308) | `founder-key` | 1 | register@12 |
| [packages/platform/src/register.ts:310](../../packages/platform/src/register.ts#L310) | `founder` | 1 | register@12; matching directory@11 |
| [packages/platform/src/register.ts:421](../../packages/platform/src/register.ts#L421) | `founderHandle` | 1 | register@12; matching directory@11 |
| [packages/platform/src/register.ts:425](../../packages/platform/src/register.ts#L425) | `founderHandle` | 1 | register@12; matching directory@11 |
| [packages/replay/src/verify.ts:704](../../packages/replay/src/verify.ts#L704) | `founding` | 2 | Entry wire version 2; keep Entry-v1 readers |
| [packages/replay/src/verify.ts:1334](../../packages/replay/src/verify.ts#L1334) | `founding` | 2 | Entry wire version 2; keep Entry-v1 readers |
| [packages/scope/src/core.ts:46](../../packages/scope/src/core.ts#L46) | `founding` | 2 | Entry wire version 2; keep Entry-v1 readers |
| [packages/scope/src/entry-signer.ts:7](../../packages/scope/src/entry-signer.ts#L7) | `founding` | 2 | Entry wire version 2; keep Entry-v1 readers |
| [packages/scope/src/host-wiring.ts:32](../../packages/scope/src/host-wiring.ts#L32) | `found` | 1 | register@12, directory@11, membership@7 and destination@7 for the carried native fields |
| [packages/scope/src/reads.ts:171](../../packages/scope/src/reads.ts#L171) | `founding` | 1 | Entry wire version 2; keep Entry-v1 readers |
| [packages/scope/src/register-host.ts:103](../../packages/scope/src/register-host.ts#L103) | `found` | 1 | register@12, directory@11, membership@7 and destination@7 for the carried native fields |
| [scripts/demo-captures.ts:70](../../scripts/demo-captures.ts#L70) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-captures.ts:251](../../scripts/demo-captures.ts#L251) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-captures.ts:263](../../scripts/demo-captures.ts#L263) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-captures.ts:266](../../scripts/demo-captures.ts#L266) | `found` | 1 | register@12, directory@11, membership@7 and destination@7 for the carried native fields |
| [scripts/demo-captures.ts:294](../../scripts/demo-captures.ts#L294) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-captures.ts:316](../../scripts/demo-captures.ts#L316) | `founder` | 2 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-captures.ts:356](../../scripts/demo-captures.ts#L356) | `found` | 1 | register@12, directory@11, membership@7 and destination@7 for the carried native fields |
| [scripts/demo-captures.ts:366](../../scripts/demo-captures.ts#L366) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-captures.ts:418](../../scripts/demo-captures.ts#L418) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-captures.ts:419](../../scripts/demo-captures.ts#L419) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-git-host.mjs:33](../../scripts/demo-git-host.mjs#L33) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-git-host.mjs:100](../../scripts/demo-git-host.mjs#L100) | `foundId` | 2 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-git-host.mjs:100](../../scripts/demo-git-host.mjs#L100) | `founderHandle` | 2 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-git-host.mjs:115](../../scripts/demo-git-host.mjs#L115) | `founderHandle` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-git-host.mjs:125](../../scripts/demo-git-host.mjs#L125) | `foundId` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-git-host.mjs:125](../../scripts/demo-git-host.mjs#L125) | `founderHandle` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-git-host.mjs:127](../../scripts/demo-git-host.mjs#L127) | `founderHandle` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-git-host.mjs:131](../../scripts/demo-git-host.mjs#L131) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-git-host.mjs:131](../../scripts/demo-git-host.mjs#L131) | `founders` | 1 | register@12 |
| [scripts/demo-git-host.mjs:139](../../scripts/demo-git-host.mjs#L139) | `foundId` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-git-host.mjs:139](../../scripts/demo-git-host.mjs#L139) | `founderHandle` | 2 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-git-host.mjs:166](../../scripts/demo-git-host.mjs#L166) | `found` | 1 | register@12, directory@11, membership@7 and destination@7 for the carried native fields |
| [scripts/demo-git-host.mjs:166](../../scripts/demo-git-host.mjs#L166) | `foundId` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-git-host.mjs:166](../../scripts/demo-git-host.mjs#L166) | `founder` | 2 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-git-host.mjs:166](../../scripts/demo-git-host.mjs#L166) | `founderHandle` | 2 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-git-host.mjs:186](../../scripts/demo-git-host.mjs#L186) | `found` | 1 | register@12, directory@11, membership@7 and destination@7 for the carried native fields |
| [scripts/demo-git-host.mjs:214](../../scripts/demo-git-host.mjs#L214) | `founderHandle` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-run.ts:71](../../scripts/demo-run.ts#L71) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-run.ts:153](../../scripts/demo-run.ts#L153) | `founder` | 2 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-run.ts:155](../../scripts/demo-run.ts#L155) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo-run.ts:156](../../scripts/demo-run.ts#L156) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:21](../../scripts/demo/rehearse.ts#L21) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:22](../../scripts/demo/rehearse.ts#L22) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:158](../../scripts/demo/rehearse.ts#L158) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:167](../../scripts/demo/rehearse.ts#L167) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:172](../../scripts/demo/rehearse.ts#L172) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:173](../../scripts/demo/rehearse.ts#L173) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:177](../../scripts/demo/rehearse.ts#L177) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:181](../../scripts/demo/rehearse.ts#L181) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:186](../../scripts/demo/rehearse.ts#L186) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:191](../../scripts/demo/rehearse.ts#L191) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:196](../../scripts/demo/rehearse.ts#L196) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:206](../../scripts/demo/rehearse.ts#L206) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:236](../../scripts/demo/rehearse.ts#L236) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:259](../../scripts/demo/rehearse.ts#L259) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:337](../../scripts/demo/rehearse.ts#L337) | `founder` | 1 | Local demo custody schema 2 for retained request ID and role/handle keys; preserve old identity; matching native versions for signed fields |
| [scripts/demo/rehearse.ts:459](../../scripts/demo/rehearse.ts#L459) | `founding` | 1 | CLI custody schema 2; this is retained config.plan |

## Digest-addressed initial Git content

| Source | Literal | Later version |
|---|---|---|
| [packages/platform/src/destination-objects.ts:44](../../packages/platform/src/destination-objects.ts#L44) | `Founded by <handle> through the room <directory id>.` | destination@7; existing Git IDs remain unchanged |
| [packages/platform/src/destination-objects.ts:60](../../packages/platform/src/destination-objects.ts#L60) | `Found this repository.` | destination@7; existing Git IDs remain unchanged |

## Operational storage and retained source

The outbox ID strings in Receipt.sends are unchanged. The private SQLite
column `request_index.duty` remains at its original name; the public
projection is `outboxId`. The exact old one-key operator JSON reference
`{"duty":"seq.n"}` is normalized on read only; new writes require
`outboxId`. These are outside signed history and have no native definition
version. A future private storage revision can migrate them without
changing a journal. See request-index.ts and operator.ts in the Scope
package, and the existing retained-record witnesses.

Jam record.ts retains six ordinary lookup identifiers in its exact
historical deployed-source.json closure, together with its old bundle.
Independent review 670198c8 assesses these as outside scope-making wording.
No broad exception, parent closure or new Jam source/asset review is claimed.

| Location | Meaning |
|---|---|
| apps/jam/src/record.ts:133,135,138 | segmentAtTime initializes, updates and returns the last segment starting at or before the queried time |
| apps/jam/src/record.ts:142,144,147 | segmentAtBar initializes, updates and returns the last segment at or before the queried bar |
| apps/jam/deploy/assets/app.js:217,219,222 | retained bundle copies of segmentAtTime |
| apps/jam/deploy/assets/app.js:225,227,230 | retained bundle copies of segmentAtBar |

The unchanged source is 9,603 bytes, SHA-256
4de1fbca151f4cecadaddf54a2381415cf87eaa2c0dbc0196370b4746e46c0d1.
The unchanged bundle is 48,745 bytes, SHA-256
8637e95407834c75c47dbd0052471261674824b5e9e3dfb9cfbf2da941dd45e2.
These hashes identify the historical deployment closure; they do not turn
ordinary lookup identifiers into pinned definition literals.

Historical Markdown, old request IDs, signed fixture nonces, chosen handles
and the inactive protocol specification keep their historical spellings.
They do not expose a compatibility method or command alias.
