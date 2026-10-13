# Two-tail logo and browser icon

Request `259e2eab`, amended by `a559673b`, `05fa9606`, and `c5703625`.

The twelve adopted SVG masters add the opposite tail and use an 8-unit gap beside the diamond. Wordmarks use a 432 × 256 canvas. Home, Room, and Counter CSS reduce wordmark widths by 432/440 to preserve their displayed heights. Jam-owned files and its deployment remain deferred.

The browser icon uses the adopted reversed, thinned path in white (#FFFFFF) on a forest green (#123F2B) disc. Its 256-unit canvas uses radius 128 and translate(34.4 34.4) scale(1.3), with transparent corners. No alternate drawing was selected.

All 23 distribution files were regenerated once, with Node 26.11.1 and sharp 0.35.4 from an existing installation outside the checkout:

```sh
/opt/homebrew/Cellar/node/26.11.1/bin/node /Users/hughpyle/play/artroom-worktrees/dap-logo-two-tails/scripts/brand-dist.mjs /Users/hughpyle/.npm/_npx/d77349f55c2be1c0/node_modules/sharp/dist/index.mjs
```

The command ran from `/tmp` and exited 0. Authored input and tool hashes matched before and after. Root viewed the actual 16-, 32-, and 48-pixel PNGs at original size and distinguished both tails in the 16-pixel PNG. This is provisional PNG evidence. Normal-size Chrome tab-strip captures in light and dark mode are still owed for Home and Counter.

Brand embedding, Page and Counter asset producers, owning checks, the gate, review, landing, deployment, and served wordmark-height readback are unrun at this Source head. The Home build will run after landing. No package was installed in a checkout.

## Regenerated distribution

| File | SHA-256 |
|---|---|
| `brand/dist/dap-wordmark-black.svg` | `85c0eb72b5b8dc6cf35a15e2d31684bc7b1b476f3ce31268a2969fdaca61a3d2` |
| `brand/dist/dap-symbol-black.svg` | `c905d03497c73460532e73528f363a67769b06817fbc05eef13b5604d65fefa7` |
| `brand/dist/dap-wordmark-black-1200.png` | `946d78f089cde0433dc3f80d246cfa22dd20dd07d8b08e3b9b6f0b28449768a1` |
| `brand/dist/dap-wordmark-white.svg` | `8f8d768a657503ec3b219da6c659017ad238f785488c21f201338e9ab450415c` |
| `brand/dist/dap-symbol-white.svg` | `2724bab8c3313cf37a61cb72ef730299151aeda865f341c172809e643eea8cd5` |
| `brand/dist/dap-wordmark-white-1200.png` | `269fe4001d2d7a0eb53e60733893270817f67cf6c745016d7a3432e0d8cbc804` |
| `brand/dist/dap-wordmark-mono-123f2b.svg` | `5ba72bd0a169225b76f63910dc0c7c1fc0d31966f40c20fdd47b9df4584a0cd6` |
| `brand/dist/dap-symbol-mono-123f2b.svg` | `30eebc26355968fc6f63740a9500a7f043015614b3af7f6f64760b421824ed04` |
| `brand/dist/dap-wordmark-mono-123f2b-1200.png` | `b3794ed45a28b3d401af62dbee9c17343258c565d859a583f28fdc77d068ea7f` |
| `brand/dist/dap-symbol-square.svg` | `69abb6f3e505dfa3f3a548d44df0f2230a342a9dff9c9b5ebb960ae46f01d749` |
| `brand/dist/dap-symbol-app-icon.svg` | `a21b34635194f90082f6ba16cbdb4fd36554fdd39ee63e73bf4bd29befe4f6e3` |
| `brand/dist/dap-symbol-favicon.svg` | `5020dc1a8a4b59297cb88a47c2e91f832d613a3c4b9a8116a0de6ec77f9f1ae4` |
| `brand/dist/favicon.svg` | `5020dc1a8a4b59297cb88a47c2e91f832d613a3c4b9a8116a0de6ec77f9f1ae4` |
| `brand/dist/favicon-16.png` | `8a7dca007a814473cb71145c225524140870e29aa072cc4f431836074a3a9588` |
| `brand/dist/favicon-32.png` | `3089ef32b45efe16569e3bae5c64dd78a1a793ba5c7c5fc9379b546a191741fa` |
| `brand/dist/favicon-48.png` | `0d020e6943836514ac55003f7c62848da745db8ac7d860e737193ded6aaf21dd` |
| `brand/dist/favicon.ico` | `7d577c8566b9cc1f9a61931db811908ea91e367e8e56c2b77cde35d27a2453bb` |
| `brand/dist/apple-touch-icon.png` | `b361ef25a63568886bdfc793768efa34af1133a09742b4acda7303e83ffe9e32` |
| `brand/dist/icon-192.png` | `542c1513ec02b4aec405ed1fe1f677e37168fbfc6fb3d51041433700be0ffae8` |
| `brand/dist/icon-512.png` | `12b2f6e175df260f5e7d44c0807a0e92cdc39b7560c4ce2c8c4098c36cedf0fc` |
| `brand/dist/maskable-512.png` | `53e80ae66a626f37086f5eed33fb03d285f1ba738976007011da09c804e81a47` |
| `brand/dist/head-snippet.html` | `054c94be5f273ce6dc83ae2bde28983b2d182cad2ac55d148582023b3572b5eb` |
| `brand/dist/site.webmanifest` | `007c4b24b5ce9abf4814fb1ef268945b2a76ece1a071cedea2702c09bf8e7afd` |

## Checked code and generated assets

The earlier unrun list describes the initial Source preparation. Root subsequently ran each public producer once at `939afad767dc26b5ffd5715447972a4822ad6302`, tree `c98ad9fb1b897a70118aa8c4ca87207c6647923c`: brand embedding, Page, Counter, and a local Home build. Each command exited 0 and its post-command guard passed. No distribution file was regenerated. Root independently matched all 17 embedded brand assets to the explicit public allowlist and the Page and Counter modules to their emitted files.

The generated outputs were committed at `e12449e5d89c983622387a2ea657d8a89fdf973d`, tree `2add32d2f3841cb165baa484d8f629bf582aad1d`. That commit updates the Scope brand, Page, and Counter modules and the tracked Counter browser CSS. The local Home output is `/private/tmp/dap-logo-home-local-one/assets`; it is local evidence, not a deployment.

Root ran the focused checks at that exact generated head. Original command 75329 exited 0: all three declared compiler roots passed, and exactly six owning cases passed with no added cases or coverage issues. The cases protect current brand, Page, and Counter asset bytes, the existing Page shell behaviour, and the public brand and Counter routes. Root also read the separate Home owning Node command’s original output: exit 0, one test passed.

The ordinary gate ran once at the same generated head. Original command 8336 exited 0; whitespace, typecheck, and test phases passed. Installation was skipped. Vitest passed 1,042 cases and retained two original skips. The two Node groups passed 9 and 55 cases. The post-command guard passed. The gate command’s observed wall time was 126.588 seconds, excluding wrapper guard and report work. No check, gate, or producer was repeated to prepare this note.

This appended delivery text changes only this note. Review must bind the final note-only head to the checked generated head and preserve its executable Source and tests. The earlier original PNG view remains provisional.

## Remaining hosted delivery

The full logo request remains open. A bounded Source child can cover review and landing of the code and generated assets before the existing hosted delivery continues. Actual host refresh and served asset readback are still owed, together with desktop and mobile wordmark-height comparisons on Home, Room, and Counter.

The original hosted plan required four normal-size Chrome tab-strip captures. Hugh subsequently accepted the served tab icon out of band; planner amendment `fb1c9d66` supersedes that capture requirement, as recorded below. Jam-owned files and any Jam host deployment remain deferred.

## Recomposition and checks on actual Start main

The logo is composed onto landed Start main `062e1adbf1bb0c969b21c1ac9793510e5636b783`, preserving its Create, MCP, Names and Start Source. Home and its test retain the documentation README link; unlanded self-host changes are excluded. The twelve masters and 23 export files remain exact original bytes.

Authored Source is `180534296c95061b24e19b1a01808189a0420623`. Root materialized its private namespace once: command 67054 exited 0, with 5,498 verified files, 13 workspaces and 229 external lock rows; no install or deletion. Page command 46772 and the original Counter producer each exited 0 with post-command guards passed. The Page emitted HTML/JavaScript match its module; the Counter files and module remain exact a09. All 14 Home build inputs remain exact a09, so no Home producer or standalone Home focused check was repeated.

Only the generated Page module changed in checked head `5df0af38fa7b79ab0fc1e17d33ba6a12698b1343`, tree `7ab8b2287711becc1efcb77e37dcada031331022`. Focused command 15128 exited 0: three compiler children and exactly seven owning cases passed, with no added cases, coverage issues or retries. Ordinary gate 6622 ran once at that head and exited 0 with its post-command guard passed. Whitespace, typecheck and test passed; installation was skipped. Vitest passed 1,141 cases with three retained skips (210 passed files, one skipped); Node groups passed 10 and 55 cases. Skip markers were budget, demo and record, one case each. Command wall time was 129.856 seconds; user/system times were 179.14/33.89 seconds, excluding wrapper work.

This delivery changes only this note relative to checked 5df. The external correspondence record binds the final head and confirms every other leaf remains exact. The 53 artifacts rest only on effective promise `fbd2e76ee66889389ba6463d85be47e659122645`, under bounded Source request `3dc428daf40730e7fb9b48490820855bf2e5fcf9`. Publish this reporting note last and read it first in review. Full parent 259e/8e4f remains open for host delivery.

Planner amendment `fb1c9d66a2dbb32b42d01b160e91a6c642861346` records Hugh’s out-of-band acceptance of the served Chrome tab icon: “I'm happy with it”. No further builder tab rendering or checker tab review is required; icon bytes are unchanged. Review covers actual-main composition and unchanged wordmark assets. Actual host refresh/readbacks and wordmark-height correspondence remain owed. Jam-owned Source and hosting remain deferred. No full-parent fulfillment or hosted result is claimed.

## Final receiving composition and checks

The logo now preserves landed self-host main `862ac59ee4acb781264c1709dd28be85313fa5d1` and the original approved tutorial landed as actual main `5cd6bb6989226209fce2f3ac1981fd46c7c06a0b`, tree `6ecf67e4453cbe92d94939febbd2969b52a124e3`. Root read the effective tutorial receipt `ce6e7cace07561cea07bb83b6ac097ce2cf38610`. The actual receiving tree matches the prospective self-host/tutorial union; adding the approved logo yields exact Source `aadef2377ff8f6f94901751bc1a08c6074eca6cc`, tree `a2ba1352393bd087a7a1091c47cd20023a7f7244`.

The Home guide link and its test expectation remain paired with the logo width and favicon changes. The receiving Worker cache/ARTIFACTS_NAMESPACE tuple, tutorial and guide index, Start, MCP, Create and Names are preserved. Earlier bc579/a09 fourteen-input Home equality is historical and does not establish this changed guide-link Home.

Page and Counter Source graphs, producer inputs and output modules remain byte-exact bc579; brand Source and exports are unchanged. No Page, Counter, brand or distribution producer was repeated. Their old tests and gate remain attached to their original heads; they are not the new executable-union gate.

Root materialized the new private namespace once: original command 9574 exited 0, with 1,511 Source pins, 13 workspaces, 27 export targets and 5,498 verified dependency files; no install or deletion. Home command 83900 exited 0 with its one Node case passed. Scope command 70133 exited 0: one compiler and all six existing artifacts-wiring cases passed, with no coverage issues or added cases. Final Source, namespace and actual-receiving guards passed. The closed owning proof is 2,506 bytes, SHA-256 `c77a875b811084676beca999cde4e6d4e0a97bdd9bed0091c6ce547c12dfca42`.

The ordinary gate for this new union ran once at aadef. Original command 39256 exited 0, including the final Source, namespace and receiving-main guards. Whitespace, typecheck and test phases passed; installation was skipped. Vitest passed 1,141 cases with three retained skips, across 210 passed files and one skipped file. Node groups passed 10 and 55 cases. The measured gate wall time was 129.347838 seconds; its outer timer recorded 129.34 seconds real, 178.92 user and 34.18 system. These describe the same run, excluding wrapper guard work. This final delivery changes only the note relative to checked aadef; the external correspondence record binds its final commit and all other leaves. The 53 artifacts rest only on effective Source promise fbd2 under bounded request3dc428. Publish this reporting note last and read it first in review. No producer, check or gate was repeated for this prose.

Hugh’s icon acceptance in amendment `fb1c9d66a2dbb32b42d01b160e91a6c642861346` remains effective: unchanged icon bytes need no further builder tab rendering or checker tab review. Full parent259e/8e4f remains open for actual workroom, Counter and homepage refresh/readbacks and served wordmark heights. No functionality or height duty is cut for the deadline; Jam-owned work stays deferred.

## Hosted delivery and served wordmark measurements

This record documents completed non-Jam hosted delivery under full request `259e2eaba532bfe4ab0038f8d5ce47c83b3c1dc4`. Bounded record request `98d520513a76e3f1d4d115ca3d02979e81ef980c` and its own promise `c565e0e1bc72f121c755711c3d21b08396f7fb98` are the basis for this delivery review. The full parent and promise `8e4f75181a509eb3c45ca428dbfe1ce8f49ba188` remain open for deferred Jam-owned scope. This record updates the historical outstanding-host statements above. The bounded Source child `3dc428daf40730e7fb9b48490820855bf2e5fcf9` and promise `fbd2e76ee66889389ba6463d85be47e659122645` were already satisfied and are not the basis for this hosted-delivery review.

The reviewed Source remains `950ee6a85690a7ff5643a146bd69899077db11f9`, tree `40f349a34285ee069c3e2d9ced706bfb03d4e730`. Approval `0b4c76430215823cafc54dd4f0301e028b49514d`, ratification `3d2a21f3bca8b4531fdf55609e709dd3cc41b07d`, and normal landing receipt `fbedaa11f779801a2705c8719f5c0537e56b07ee` bind that Source. Hosted publication used main snapshot `d3f5aa74218cabd8200468616a4b9e60c8d6f8a6`, tree `fe870241e071387305e97efc70aca3af2028794d`, whose executable Source matches the approved candidate. This final candidate changes only this note from that snapshot; external correspondence records every other leaf unchanged.

All three existing hosts now have matching served assets:

| Host | Original command and version | Served result |
|---|---|---|
| Home | 1897; `62889daf-97c7-43d4-825b-3fcf1e9b21c8` | Exit 0; all 11 assets matched. |
| Workroom Scope | 16087; `30e8be7e-7935-4fbd-a951-501da66321e4` | Exit 0; all 22 assets matched, nine protected bindings retained. |
| Standalone Counter | Upload 61277; `4772f607-ff16-41af-962b-801f5a3cf663`; read-only completion 99603 | Completion exited 0; all 22 assets matched, six protected bindings retained. |

Counter upload 61277 deployed successfully once but its wrapper exited 1. Its first `/page/` read returned 25,162 bytes instead of the expected 26,184; the other 21 reads were unrun. That failed result remains intact. Separate read-only command 99603 checked all failed or unrun assets and the protected resource projection before and after. The same version remained active at 100 percent throughout. No second upload occurred, and no cause is inferred for the earlier mismatch. Root read the complete host proofs and recorded served assertions `9cc61`, `683e5`, and `cc10`.

Served geometry command 45787 exited 0. All ten desktop and mobile cases passed across Home marketing, Page, and Counter, with 74 allowed GET requests and no errors. Root read the complete measurement and request record and directly viewed all ten screenshots. Headers were clear and had no horizontal clipping. The intrinsic wordmark is 432 × 256.

| Surface | Desktop height | Mobile height | Qualification |
|---|---:|---:|---|
| Home, Room and Counter marketing pages | 123.625 px | 94.53125 px | Earlier served Home heights retained; current Room and Counter marketing measurements match. |
| Page | 41.875 px | 41.875 px | Current served measurement; prior app height baseline unproved. |
| Counter | 51.1875 px | 41.875 px | Current served measurement; prior app height baseline unproved. |

The Page and Counter widths implement the adopted height-preservation intent. Their measured heights establish current rendering, not a comparison with an unproved prior app baseline. Hugh’s served tab-icon acceptance in amendment `fb1c9d66a2dbb32b42d01b160e91a6c642861346` remains effective. No further tab rendering was required, and the icon bytes remain unchanged. Jam-owned application files, hosting, and audio remain outside this delivery.

The five direct public proofs are:

| Proof | SHA-256 |
|---|---|
| Home publication and readback | `9176d174245651ac28e575dfc816f01dcef2c5eb78e97977378be672fbe94cfb` |
| Scope publication and readback | `9f2b5a2aec08c14f701bf31f302fb5ecc2c2533170dcfeb699adf13665c4a874` |
| Original Counter failure | `1f2041d653fefb278b0b5dd86fb08d55ce0eedaa8db1e074ffb0766887775bb7` |
| Separate Counter read-only completion | `1736a66de8d5f4544680ce8249276fe0ec76c145141560bc07563d4587198fc7` |
| Served geometry and requests | `787eb65094da4e0aa49e8e2caaa61fb70766df4b0cd5fb69a0734ecc7d0ea0d7` |

No producer, build, test, gate, provider command, or rendering was repeated for this note. Earlier checks retain their original head qualifications. Review and approval of bounded record 98d520 under promise c565e0 remain pending. The full parent remains open for deferred Jam-owned scope.
