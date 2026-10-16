# Plan 027 v2 design document delivery

Planner request `fe9685564b97fd1f7a335e71ac29bc8e501221f0`, recorded at 21:25 Eastern on 2026-10-08, attributes Hugh’s acceptance of these v2 files as the workroom’s UI design. Builder promise `92b2467c3bad4aac0988de049714bade938142d0` covers their document-only publication. The plan README links the current accepted design and keeps the earlier proposal and handoff status intact. This delivery starts no application UI implementation.

The producer-owned source is `/Users/hughpyle/play/artroom-worktrees/usability-review/plans/027-artroom-usability/v2`. Its worktree HEAD was `1eed91aacac56649ac0b75c0652215b0418eeff8`, but v2 was untracked: that HEAD does not identify these delivered bytes. Builder copied the complete 15-file directory and verified the source and candidate bytes at `2026-10-09T01:23:56Z`. The original files were not edited, regenerated or removed. Paths below are relative to `plans/027-artroom-usability/v2`.

| File | Bytes | SHA-256 |
|---|---:|---|
| `artroom-refined-design.html` | 53113 | `a13a48faad504c9ca5b072dbfb7260d8cc00fbd987aa85807224a9c45e507e77` |
| `checks.json` | 24641 | `435281e6a42342123aabf0c53b8e78f594469ab5e13e3aa026ac2c99148d1d15` |
| `concepts/change-merged-desktop.png` | 1091289 | `42d0e4aad508b5df04a3599501b49e65542867f0025d26bc1dea206137dfb4cf` |
| `concepts/issues-desktop.png` | 1051592 | `36c6008d703140ee7c9e523727a2e85965bf67bdf1d4d5c5c106211cd54cd505` |
| `concepts/issues-mobile.png` | 1069808 | `f45b618158b9ac8b268f61146f6d8cd805904a1eb2f3cdbae441c75ab37b079c` |
| `contrast-and-flow-checks.json` | 1679 | `04991b9eda152639341cc7a02b5a55f02876d5b06e0e0bd249a75d939fb985bf` |
| `design-review.md` | 11962 | `6e36158d827c08681f001dde3475aeb45b1f7e75eb66adc850a0bdeb7f5f0edb` |
| `screens/change-merged-desktop.png` | 44500 | `8111a41782c7ac3d1efb2775b5f2caa91a6237714789c4b34e8c01e5c9ea534a` |
| `screens/change-merged-native.png` | 70841 | `ddf5482c8b982db129668219d440f01394391c46ad96eb48d01177f50fcbaee2` |
| `screens/create-room-mobile.png` | 39004 | `f9be177a73e7c06e83ad1437c4142f8875f34cf6875ab4dbafe69be35e86d4d4` |
| `screens/invalid-path-mobile.png` | 32620 | `1797e4c809de103d49b8833862cce06d8cd6ea6a5c3b1327f06b10e41986bcba` |
| `screens/issues-desktop-native.png` | 84992 | `0bc21ca04bc5f6760d3a830250685d93aeb109718dc231d48476b3c70520223e` |
| `screens/issues-desktop.png` | 50897 | `26aec63756c56e46fe90183192a12eb3803e6f757894fb27ee6aa0981d67e7e6` |
| `screens/issues-mobile.png` | 42023 | `20c97e6a0cc32b70ea81a9f9f9be5629a6eb7bbcf5714a025a9972ee5f22608c` |
| `screens/rules-mobile-dark.png` | 33989 | `31ea3a89765804b2b50a0762bc82d63595853b8f18658ead9c72f78caefeabf1` |

All four text files were read completely, including the HTML/CSS/JavaScript and both JSON records. Both JSON files parse successfully. Builder visually inspected `concepts/issues-desktop.png`, `concepts/issues-mobile.png`, `screens/issues-desktop-native.png`, `screens/issues-mobile.png`, `screens/change-merged-desktop.png` and `screens/rules-mobile-dark.png`; these show the stated Issues, merged-change and Rules designs. The remaining five PNGs were preserved and hashed, without independent visual inspection. This is inspection of retained files, not a new browser or interaction run.

The producer’s `design-review.md` reports cached Playwright 1.63.0/Chromium verification, 99 responsive checks, ten component contrast checks, and local sample interactions. Retained `checks.json` declares `layoutChecks: 99` and contains 99 snapshot records, 17 interaction labels, empty `errors`, and six capture names. Its recorded snapshot widths are 288, 320, 358, 390, 568, 704, 736, 768, 1024 CSS pixels; these are the raw record’s widths, whereas the producer’s prose describes browser-window widths. Their correspondence was not independently measured. `contrast-and-flow-checks.json` contains 10 contrast records and empty `consoleErrors`. These are producer-attributed records, not fresh builder acceptance of browser behavior, accessibility or production flows. The HTML is a local-fixture sample with host widget/icon helper hooks; publication does not claim it is the connected product or a self-contained deployed application.

The producer leaves physical-device, assistive-technology, zoom, virtual-keyboard and live-provider acceptance outstanding, and says the native Page host was not visually inspected. Builder ran no browser, provider, Page embed, model generation, prototype rebuild, package installation, application test or gate for this publication.

The only changes are the 15 copied v2 files, the plan README, and this delivery note. Relative to base `3b468cd04c5cd3925592fed28d9e801323c92702`, application packages, tests, scripts, manifests and configuration are unchanged. Both base and candidate package tree hashes are `079d37fb03d0fc8ba05ffffac68ef4ce73173361`; both script tree hashes are `2f54f700425ba0984e276b72b2804e24d7cb1991`. Per `docs/testing.md`, document-only publication reuses the retained source/test gate without repeating it. Review, approval and landing remain the root builder’s work.
