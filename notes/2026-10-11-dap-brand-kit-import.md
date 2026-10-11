# Import the dap brand kit

Request: `719d2b572ce54d50aec5d4cdfdcadda9333a969d`.
Builder promise: `40f8bba4d1b6447c0c7569222736a02e341662bb`.

`brand/` contains all 38 files from `~/play/dap-logo-concepts/kit`, with unchanged bytes. The named generator was absent from `kit/`; `brand/gen6.py` copies `~/play/dap-logo-concepts/gen6.py` unchanged. `brand/README.md` records the origin and the generator’s actual output limits.

Focused checks compared every copied file with its source, parsed all SVGs and the web manifest, and regenerated the 13 master SVGs in a scratch directory. All 13 matched the supplied masters byte for byte. The generator does not produce the distribution files, CSS tokens, or guidelines. No application code, UI, dependency, or deployment changed. The gate and bounded completion outcomes are recorded under Review checks below.

## Copied file SHA-256 digests

The following script computes every copied file’s digest from the committed tree. It excludes the authored README. Run it from the repository root at this delivery commit.

```sh
python3 - <<'PY'
import hashlib, subprocess
paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', 'HEAD', '--', 'brand'], text=True).splitlines()
for path in paths:
	if path == 'brand/README.md':
		continue
	body = subprocess.check_output(['git', 'show', 'HEAD:' + path])
	print(hashlib.sha256(body).hexdigest(), path)
PY
```

| File | SHA-256 |
|---|---|
| `brand/GUIDELINES.md` | `07421ace8221fc158b743db35c9851f65303c96eafeb405725003d0f0969de16` |
| `brand/alt-wordmark-garnet.svg` | `e4bb3072d73a923ae01b127ff5e0afa318240aff68eacc8c27d0bc76af019c2f` |
| `brand/alt-wordmark-ink.svg` | `e01c079475ed9a33b1aae3149052d5b5102a8a5a7073b8bc6854156193ea1d82` |
| `brand/alt-wordmark-violet.svg` | `47f2d4f76a4c31b9825575285330b8322b7d11222330b139986a48316bdb66e8` |
| `brand/dap-symbol-green.svg` | `084781b1b61462c614b67ca2dc54231810f72193a84ec47cfe50ca03196cda43` |
| `brand/dap-symbol-on-green.svg` | `1aea9cddb7dfd527912bc37ae43c26a61f2c4d52cb659f2d3f35d9b4b7489108` |
| `brand/dap-symbol-reversed.svg` | `5fa3e5e561f30355250aae4a0219320f64548a338b7ab2ff6ea9e03466e85769` |
| `brand/dap-symbol-small.svg` | `511ffaf4b14aeb95aef92817a830bd658f408ba382e02f581ce918088976ca20` |
| `brand/dap-symbol.svg` | `e0aef93f3d37f0cd3c32e8a73e9cbc111b331ada57c2a539d1c08e3686ceceb8` |
| `brand/dap-wordmark-green.svg` | `b7a21194cb1de0125fcfe19a1aa8c21ebb459a260cf76810bb27fb7923895f8e` |
| `brand/dap-wordmark-on-green.svg` | `08e056380507c56236a82510548317a639aa2b370df35b52fef2ce3c72ec5e77` |
| `brand/dap-wordmark-on-ink.svg` | `d88490bec825291a622cb8a009d2673edab20e4518b5070efb490c25f35b36e9` |
| `brand/dap-wordmark.svg` | `f9ad619f529bc0cdf71e944ac9381a2ee466f0fd2e725dfb0ce39a70316b78da` |
| `brand/dist/apple-touch-icon.png` | `d6142a3f61c0224a507ec2ec833d25380f8c7530b1bf43a6f98cd5c4395db118` |
| `brand/dist/dap-symbol-app-icon.svg` | `d54a16af41abd2a93a4889615bf7c1bdaa5452855ee5f60ade3b8e7f3ae0690b` |
| `brand/dist/dap-symbol-black.svg` | `8d6d0bbf0a88f1bc2f759928b59d94dcf0f4cbbc92b8afd89aca1138ca1e9570` |
| `brand/dist/dap-symbol-favicon.svg` | `00633187018816060ded139e2614fe0b6ec1f445ce87384a1d1f4fcbd117ef6c` |
| `brand/dist/dap-symbol-mono-123f2b.svg` | `ad223be6d6d2d13ceda68e626f2f8ab42f95ab51e045438a5053a267e6c3d65c` |
| `brand/dist/dap-symbol-square.svg` | `5014ada30aa0ee98a2c14c3037330e408b2e92075da79159bb7fc1ab414b15d2` |
| `brand/dist/dap-symbol-white.svg` | `14e7150a30b948cbff1be9dbe35b98f34c36c4a07c5538da37627fc67a2d5d89` |
| `brand/dist/dap-wordmark-black-1200.png` | `9b59b3cbff7ae518a55f89d48b16338159b05ff6143cc2c4678cb01d92ede0a5` |
| `brand/dist/dap-wordmark-black.svg` | `eb8285b130cd408e427897fdca5c3391ade112f69a8ad526596c7094824efe57` |
| `brand/dist/dap-wordmark-mono-123f2b-1200.png` | `b5829d24ab4cf38bf31afd819b1d727c4980bdcf0c995b9a8acff772e7236d8e` |
| `brand/dist/dap-wordmark-mono-123f2b.svg` | `ac0fa89c1e34d1e7a4bf0099df0ad6762a99c02df883e55508aef71d40020989` |
| `brand/dist/dap-wordmark-white-1200.png` | `98c6d191acac67455d2ee1137ec7591ee15748f59b63997f196453a76c7ca269` |
| `brand/dist/dap-wordmark-white.svg` | `2f2d138ef9994f6461be20f87a98a0d1c6b94dbc606768a7ca57136a4121796d` |
| `brand/dist/favicon-16.png` | `e0475bd96a5159fd0d3a669071499cc23c3362c3e53bbb0bbd162ba265491e53` |
| `brand/dist/favicon-32.png` | `364f690dea57a6aa87774487b04af7f007d8b792dc4806072c776501b848c1e5` |
| `brand/dist/favicon-48.png` | `b4dbbfa34aacfc95f3eb02f3370f1bf5c0cca2c67baae09aa523eeb774113447` |
| `brand/dist/favicon.ico` | `bc92acf0369446112bb4f0bc40d87c6dc8a525dd674676565c71ea23d98328a5` |
| `brand/dist/favicon.svg` | `00633187018816060ded139e2614fe0b6ec1f445ce87384a1d1f4fcbd117ef6c` |
| `brand/dist/head-snippet.html` | `d0a620fc912f73bd5f7e7300eedbb38070b2b5ff2e01b62ca3c1ebf68f1c2fab` |
| `brand/dist/icon-192.png` | `7408b151d8be02df532dcde643c2e2e538289c95d6115beffa5762eb0ce9d513` |
| `brand/dist/icon-512.png` | `97808ad80c8049d7deecb2004eeadba8ffe31008025498bedbcd44e65d1665b5` |
| `brand/dist/maskable-512.png` | `2975db1010739e2f4d94138a2f44a24e326e200d0ee9764a8abb4715ff79d084` |
| `brand/dist/site.webmanifest` | `eec8e91d0556365ec2e6904111f1b1c804dc38057c4cdb5714b541f393c324de` |
| `brand/gen6.py` | `93a1e8f71cd762859d7cfbb82e043d1289f6afe25da284b0ba2bcf940f4097b8` |
| `brand/tail-sheet.svg` | `785b68152f2ac91105d940ff419c29eeecf88d30e4b528509f932a558bdc3f28` |
| `brand/tokens.css` | `288136b104f15ae153a46e4f8b4917f924d6f1f17aeba22a9feb3939ddc77f80` |

## Review checks

The one normal gate at source commit `0e1d61f30cac9919b826795aec43e0c197d8fa1d` and tree `c2a360731b62958491755eac1c198d119c104082` failed (original handle `88625`). Installation was skipped and whitespace passed. Typechecking failed because existing external dependency links were broken; tests did not run.

After dependencies were restored in a scratch directory outside the checkout, bounded typecheck `85840` failed because shared workspace links loaded distinct nominal `GitProgram` identities from main and this worktree. With workspace links corrected, typecheck `4327` passed in 5.49 seconds elapsed and 18.90 CPU seconds. The first test launch stopped in pretest because the checkout’s `node_modules` was a symlink; no test body ran.

After the owned dependency directory replaced that symlink, bounded test completion `51564` passed: 1,025 Vitest cases, two existing recording skips, eight source and pool Node cases, and 37 Counter Node cases. This test command took 89.69 seconds elapsed and 134.14 CPU seconds. These are separate bounded completions, not a passed replacement gate. The original failed gate and intermediate failures remain retained. No gate was repeated. Root restored 105 dependencies offline in the scratch directory. The public proof’s `dependency_install: false` describes this agent’s checks; it does not describe root’s scratch recovery.

Durable evidence is `/Users/hughpyle/play/artroom-diagnostics/brand-kit-import/bounded-completion-final.json`, SHA-256 `47727f8976f9b6103add3d56cf2e265a13f71e06a3aa23bcce09c647f628884c`. The delivery commit after these checks changes only this note; the copied kit bytes and authored README remain the checked source.

The first documentation append stood at commit `52709897e3dfe7373ba1516efdedefaf9129cc0a`; this accuracy correction changes only the delivery note. The checked source and tree remain the pair recorded above.
