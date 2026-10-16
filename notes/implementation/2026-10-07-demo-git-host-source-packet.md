# Gate 1 GitHub source packet

Request `225da894`, producer `f8a56f1c`, branch `request/demo-git-host`.
This is the whole current GitHub source component, including the integrated
signed-read/CLI and lane-wiring delta. It does not claim delivery of the
re-cut Gate 1b ARTIFACTS adapter or whole I3.

Comparison base: `5af9abde8ec38d3bd7c08caa1e91d73a4693a0ac` (published main).
Gated source: `dfaa5395023f09adc71c8587dca3d74b65a86d0c`.
Packages tree: `186a7909b857ee5fae3de689cf2b010ac4badd08`.
Scripts tree: `c7ffb21b9435e2a7985a2bd0492c72dce1047787`.
Later candidate commits merge the already-published sprint report and add
review evidence only; these two trees remain the source correspondence.
The filing names the exact candidate head separately.

The complete binary native diff is `/tmp/artroom-demo-git-host-source-dfaa.diff`: 906299 bytes,
SHA-256 `d6c5440a6f299faa774279f679ade6baed8dbd14d7dabcaaf0c57c0827697f27`.
Reproduce it with `git diff --binary 5af9abde8ec38d3bd7c08caa1e91d73a4693a0ac dfaa5395023f09adc71c8587dca3d74b65a86d0c`.
The 98 changed tracked paths below are the complete native comparison;
no local secret file, cache or node_modules tree is in it.

Read attribution: builder and its delegated readers inspected the complete
changed source boundaries and delivery notes. Generated definition JSON was
fully parsed and structurally compared by the lane reader; the existing
canonical pin/digest witness passed locally. The packet does not borrow a
checker preflight's reading as a whole-head source approval.

## Native path inventory

| Change | Path | Blob at gated source | Bytes | SHA-256 |
|---|---|---|---:|---|
| A | `docs/cli.md` | `a4991ac5e60e9788abeccb81455098dedbe5aff3` | 8301 | `7d24f6ba5a0b08b5bdfcf268d5958a618783252d2f23bacdad35051581d2dce4` |
| M | `docs/lanes-reference.md` | `84096d6ccadf8abc061a721e367283c67fee42c7` | 35492 | `4874ab32d4d0c46915890a97b736950fb081eeed9c0b7d447c1e57495d65fce8` |
| M | `docs/lanes.md` | `4c8ea290e9bb2345e9bd226d4ffd621b73db39f1` | 24738 | `d6a8262d2eeb8f80fa32482c87a4e86470d3bbf044425b9ef8c03455751bc850` |
| M | `docs/scopes.md` | `b4eb9dd7712eec7e84cf407a55be7e260ea66222` | 51762 | `005c89e9870e36f02c96216fa1326e625728bae06bcc42c949266f3b9aed3b32` |
| M | `docs/testing.md` | `117cbb65c84bebedb499a8038545964813340b4c` | 27293 | `3c23a68039294e3fe280bb04b178e2264e4848608cbd1ec97a5bb31a66857589` |
| A | `notes/.keep-i5-client` | `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| A | `notes/.keep-i5-lane-wiring` | `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| D | `notes/2026-10-07-07-sprint-report.md` | absent | 0 | — |
| A | `notes/2026-10-07-demo-git-host-delivery.md` | `49ba98c962ec4faa8cbd4125a82baff1199c25db` | 14084 | `6187b2149d67108011d1cf4d0b95ae6b2eb5e54fbac391def6c4f20e54049368` |
| A | `notes/2026-10-07-i5-claim-live-delivery.md` | `f7d623211b5fba1e06c943530c1bcb459363a6fe` | 12803 | `5735d88d46e742f386e9734b88cc0db0e857c323f1ed99c718345a0d54b6136a` |
| A | `notes/2026-10-07-i5-client-delivery.md` | `ed18ca8b732b07939def4efffc734ffdcacac07c` | 12591 | `bfd3665f384603a46ed33538bf8540909cd60a62e1abee72c4d1c6226f71d1c5` |
| A | `notes/2026-10-07-i5-lane-wiring-delivery.md` | `815307aeccebbdfd760fda1a3e2ee4cb9817c2f4` | 22820 | `f43d9dfef9d519a839b56174cbaf66848905149568d691d365cbd07f8ee903cf` |
| A | `notes/2026-10-07-i5-signed-read-delivery.md` | `98e60d38b22ab1563b23e688896df74bc89cc2d2` | 13632 | `61ebcc2c7a099c015ee3521fb4016520d1877f07b5eefc9e4182c4239b70efea` |
| M | `package-lock.json` | `7e6e3a01844fe2d01718f26d17701619056b97e1` | 126500 | `bd4d9ed101dff266d71008f8a9ac42257093065ab5079cd399e004e40ae3162d` |
| M | `packages/bytes/src/session.ts` | `9500193451aa7491458e6bdf01a45d6f81e41c62` | 2387 | `b5d42f78a8c2eaa58fef434c4dc092cd71e203fe1fe306516b9d6d8d107ebe55` |
| A | `packages/cli/README.md` | `ca5d26320773d8b53da7dfcb12b4a04f2fce66ab` | 1203 | `f9ff4809a86a31578594f0f68d703a0975e00a1a95fe62ae2ba420d531de5ce8` |
| A | `packages/cli/bin/artroom.js` | `cf039327a8f464774bdf5bd46c31798d49fb4124` | 703 | `600d405b47f9f9f4ecc29c639273e98cb749d225e721e434fa0035279dc7c9a7` |
| A | `packages/cli/package.json` | `431b0e6b575c75bf20f6942aa2d7cec965d6fc4f` | 1212 | `52c9cfb9ba298351a3de70bdd8375e24b340f52b6ee7cdfad3d497f66fad15cd` |
| A | `packages/cli/src/commands.ts` | `5fc7e1fedb2f9d34a4b83f4e2b0be8ff178feb92` | 33707 | `707f63aaf487e38b9d80fdd528de0c59f4708615f737ed3bb5492440bb5b7f75` |
| A | `packages/cli/src/files.ts` | `5cc3da703d12b79151f8c1cd98d3006dd7b2048a` | 3240 | `f2717f07449a50ab5d920d0e7e41bebeb74dfb2aebfc237eb5b7bb18b546080a` |
| A | `packages/cli/src/index.ts` | `64af9ee9c87d3047f61a782e1d181a5a394bd930` | 215 | `f329cbabe54877ea927a2d0e892ddf10140d50924b5980d6d1361bad6f0251fb` |
| A | `packages/cli/src/line.ts` | `9681739b20cf964589fe0f1a77f3d9e5437771aa` | 3836 | `0e789a87f473c8e7867bf0959bf9bac65f8f92d66adeec842dc9235f4b79006c` |
| A | `packages/cli/src/main.ts` | `a356b88ac85e52741a7056a4bfe22022dda09e22` | 685 | `8af6aac09ed25bce777958d41cee0ea7d670796d3b781d164c71234b2687c171` |
| A | `packages/cli/src/store.ts` | `65e0e81adca7abdc27d5e426d033c39811cbd46d` | 2194 | `725b42ef81a527b27f1488a8814e53172679f8130f2fc40249544367f9ad74c7` |
| A | `packages/cli/test/files.test.ts` | `30354f63cf6d04a7ccedfa324b6dc835b0ac0825` | 6053 | `c70544f56b095a3f8e08ea34cb8e00aff04b5093c54e1c1bc511c6d9e471c516` |
| A | `packages/cli/test/story.scope.test.ts` | `183aaa3e7a379d79c22bbacdf30810e8e6dca289` | 14477 | `58c6b40d14bb5f80bfaa5cddf55f02b7fcd332bb6d0964bb430e6e3ef22a3673` |
| A | `packages/cli/tsconfig.json` | `986e302b5c88f0a0d3923514657b50b17e77dec8` | 272 | `864383214964cfc55e8d19d1ffd7f64b35f813cb417061b24e58fd9b0743e3dc` |
| A | `packages/cli/tsconfig.scope.json` | `6ad9c104155cf3c909718cddbe9e927aad6f0f07` | 515 | `6038ad1228eda947afce2779896a13335e32e93c8b78ef2d073d263e26ff71ad` |
| A | `packages/cli/tsconfig.test.json` | `9251db70b2634b9121b8a236fbfebff8a6adb220` | 127 | `ba4a0563118ca2ebc1eaaab34a0ff3574b06e4ebf508ed6d848c309ca73aab72` |
| A | `packages/cli/vitest.config.ts` | `2cc9fbdb0127b3dcefc2f794d5d764d717ee5f1f` | 395 | `5291165a9e5d07978c8ce065a5df83890a9480b7e3615f88cc82550eeaecd8d7` |
| M | `packages/client/src/index.ts` | `77ad6b4dd4ee445eb47b0d630ca333732b804a70` | 240 | `ef5184339d3b508814903c477706c96edeebdcad42a5bfc82ed3cab40101cddd` |
| A | `packages/client/src/signed-read.ts` | `47f0ce91aee23b9aa4670ed1b0f12f3bf26ccf1a` | 6180 | `b5b9fc5622743e90bbce05acb155819e3d8ca155fced6185d88d2161ca755672` |
| A | `packages/client/test/signed-read.test.ts` | `976007591335e2948732d609f151a39b8bad4a5d` | 5500 | `83705174aa342d3bc63f4b0c027271590d533f0a1e9caeee240bceca83a64193` |
| M | `packages/contract/src/session.ts` | `823e1f721c3de7d4288e383edcbecbfad69c378f` | 4830 | `f774d46671a4d61a71af4c8bc3deac9a8794b7da69c78b2293c7ced0c5fcf86c` |
| M | `packages/git/package.json` | `204de74e09ee71d00121d4b32721b5ff700a95a9` | 940 | `c15ff66e0cf6b678c168ebeb7fceadbe210151debf1bb3d8d91f87262f65d256` |
| A | `packages/git/src/github.ts` | `871680b5b013a86d083c5ce6a983772904b5c918` | 16267 | `d78f5a15cfe1b159d64f43752035c9dc43ddbd8d2e3aef1ba56799dfad52a721` |
| A | `packages/git/src/http-read.ts` | `91689a9e558d18a8feeddc491bea719ea028c500` | 21778 | `089632ce2cd115ab2c3dcdabeb8d4be68350c13e8d80f47acae0418c6548417a` |
| A | `packages/git/src/http.ts` | `b729ab8a28da8c536f7543dc9de1416f0d317dfd` | 14250 | `a4d642829ef69e0478fae52bc33cdf64519cfa27a1ed908a3abfe5a8cb545f90` |
| M | `packages/git/src/index.ts` | `653b61145a57902c4c875c00f91d60f7fe1ef0b5` | 1982 | `667788080de71d54aec39fe870ae80843decf026a11b8d2ed44773c9187fbad1` |
| A | `packages/git/test/github.test.ts` | `e60298a6f1358b634ad39c8b5082884fc69f8ea0` | 10777 | `a9b8fe0508f425fa2c8ee03b55bba0100d4269e4b2ec6e81496898564f025282` |
| A | `packages/git/test/http-read.test.ts` | `94f6ba2623bc6902823092666df9e746ea7fd3dd` | 8994 | `1ae027052957483d56caccfb56e8dc68bcbbbd9a2a96bc83eafd14129bca7660` |
| A | `packages/git/test/http.test.ts` | `38ea6bc1746d04cbdc2d683858a92361d4565c6e` | 10305 | `bc4d658694d97223a3c62c5bf74e26db9f825fb6d7a764983a4457c0264d2425` |
| M | `packages/lanes/README.md` | `2e678bda0ae2423cb573845750a2a9a63e3f0c41` | 6019 | `739ec5379fef0648716b3b4e36bc1c1aa30e74347ad88d372da504e76f28dcf6` |
| A | `packages/lanes/definitions/change-demo.json` | `fd8f29cbdc4eacedf7efc950fefd0cf4d08da751` | 41844 | `bd78e277ea0b23b3ebb0be81c74bf2474417833ac66b87a4061ddcdacb1cbc9e` |
| M | `packages/lanes/definitions/change.json` | `442f30dcd237c0177d9ea7dee23344f7a1aeb1d9` | 58429 | `468c12498bdb5c943c5230fdad8338aa61592b79caf554b074a780b90177e2e6` |
| A | `packages/lanes/definitions/issue-demo.json` | `bd33ecf9a9bc9f26963533abe7efb3eabfb00250` | 23024 | `975a6beae226c088b72cd15c2e514f3c586eb06e4327443fda36142af01eacbd` |
| M | `packages/lanes/scripts/pin.mjs` | `6bfa86476345e3cf23b2108bef0bb074502990ae` | 2991 | `68d1dcbcccf3d1ef283a26548c68f9b269e0b30b661d71bcb28fdb5afb085499` |
| M | `packages/lanes/src/change.ts` | `dcf2b7863f5235e48d046dab07e3376c9534d19b` | 76475 | `e2ed179223f155a24dc7a038d4aff5bf1ad0eda0edad8720c11ba2331c4d56c2` |
| A | `packages/lanes/src/demo.ts` | `936edd5d58d0fde22d0fdfe51d14d7c5691e4420` | 3223 | `f38461ea6c786b701987b6660b588db76d60ced6ec44ef6b3e80b25bb2c3ab06` |
| M | `packages/lanes/src/digests.ts` | `42fec75fce2ffd0e515f7eb0d3b4933988603187` | 1412 | `80c86d18b0518f2bb59f4c7986ff3567b4f7b552516a6f2c6b9009003baaa193` |
| M | `packages/lanes/src/index.ts` | `05bda92195220f26c45ff53fad6e4587236ed15a` | 1028 | `44d553ba28c35620e6b5d04cd7ddf1532a45803adeb1ba36fa29c433bbaeff63` |
| M | `packages/lanes/test/definitions.test.ts` | `65e7dfd7144a32b65e2363cdcb709ea35d8489b7` | 11414 | `4a5a2424edd0b253e993ba18aa8b4a0a39d7dde79cca8ccfdcb70c9351076ce2` |
| M | `packages/lanes/test/links.scope.test.ts` | `ea2efdfe87fa0537e09fc4dbbf9950779f9d209d` | 10244 | `8ece12bfd16d819888fb1cb326f79389c9082d3306f966951726a6fecbef6e47` |
| M | `packages/lanes/test/manifest.scope.test.ts` | `8babd832fa1685f8c484f689c2ba22d8a10eb355` | 14020 | `c3505f2ae80fa1f1fc030910660860d90f99950a3a716b6fdd91f161e56f90a2` |
| A | `packages/lanes/test/story.scope.test.ts` | `79abfd288a6d0772c1958705d082524db525aa31` | 5441 | `68a244b7df2478205d8f060bbed7522efbb57963470615094f259f12ced4a0d5` |
| M | `packages/lanes/test/support/env.d.ts` | `ef3294544f5fa9dcc903732fa45c11ae4dca1043` | 632 | `ec85c6dd0fcf00d93c73b35cffaa94db334ad44b9f87813d940b748e1ae05ebf` |
| M | `packages/lanes/test/support/graph.ts` | `dbf5b75df38333aa705525c7d9883b7eb64284db` | 31451 | `55de7f825fb47a6c1a0dfbe031b6c5917d4c0091bcfd84523421ca125d3bf512` |
| A | `packages/lanes/test/support/room.ts` | `bd74b3d343744035f4cebabbcdc122dc9076d93b` | 20172 | `13d93d3912f3926d3a61aa4700d4a0594e24f6f7cf6d4affb3fdb84ad365804c` |
| M | `packages/lanes/test/support/worker.ts` | `80c52dea4a19ec86fb1a639d075a7680bbf9dafd` | 616 | `e0117c7e1153e5edc4f62b7008b078fef9df24996deab8f66a066fe032c75078` |
| A | `packages/lanes/test/wiring.scope.test.ts` | `bf906b5d7c4408a6b1a550c7fe391d72359f5ac1` | 16710 | `95db5b23896b879d62d8de6242c5862206fed2b72b137908be6fca79d7939ce7` |
| M | `packages/lanes/wrangler.test.jsonc` | `17bc7110334e6da81a93716d11f7e4fefb4b3237` | 781 | `d055de5a3d1862795e67ef38a39b935e2297a5ba56285ec9a254bc50ae497790` |
| M | `packages/platform/src/destination.ts` | `fb6aeb13c31dde693acddb42837bc8d4effb74bd` | 115712 | `e5b184d17c18542951ac120e9d816548eebfb4c498eefae3a88e72fc62bb72e7` |
| M | `packages/platform/src/directory.ts` | `b913acd88086ff0c2e535001eaaafb8d17247d45` | 47321 | `49882b278ce9276c544fa02fdd700f945a8ce49a402b4cfdfc2986f109bb3545` |
| M | `packages/platform/src/index.ts` | `adcd27044ec293b2002ddddc5ed6b9d6208b3a3d` | 7561 | `b5ec1b6620c76c55e5ebb44a06139f81f6c15cd9abf46605383b68bc4085aab4` |
| M | `packages/platform/src/rules-scope.ts` | `6fc49ffabc5dcaec3c4518929232e71a5dd14a1a` | 37402 | `f66d867e24c38eedad69a7d3e56d0943cb92207c0f58e96f0a0d4a4c3e781ada` |
| M | `packages/platform/test/directory.test.ts` | `6ddb8ab8e7ba3780937db6ec240466c929a7ec7e` | 42802 | `eea5f3553171c356e57000a2a98f41f4a5b1a29dd137fc278b407bf33dad2920` |
| M | `packages/platform/test/rules-scope.test.ts` | `28690d0b5d0b2530af08d1933a4314c51a7f5451` | 34680 | `247d2b42be4bfd69314e07185ff584d6c9a9141027c8d0b7fe89ce512bac329c` |
| M | `packages/replay/src/source.ts` | `dd0b934dff3d6d48936ba11f9028d08d9eb16460` | 11777 | `64b8b5ae5a62cd15cf9646fddf615806cc7de9699e9ad84c706b19d3184d2b4d` |
| M | `packages/replay/src/verify.ts` | `b1cbbb72711765f7fc958bfdf40d85ecb1a58f5a` | 93226 | `3ecebd2971c8f7ca2a531443d5cf90bdf1eac3c7e06c1d9967e07cf5fe36a6a3` |
| M | `packages/replay/test/cli.test.ts` | `edbb2b3cc1d808aafdf737016c4ef14ba1329018` | 9806 | `bece058ffd2ac619e380958e88d8fbbd5cdaf400dd099470d3877bdfc8bda5c7` |
| M | `packages/scope/README.md` | `b0b89fe8a026d5b1735ad489021c5b0e7449bc59` | 45182 | `7eb6bcfe669348f7628386cd46a813f966673783bc5576c59d6532bf519ba308` |
| M | `packages/scope/package.json` | `d93586567d6aea321d70641bdba76660260bb576` | 1261 | `83d6a88b0c605e591a9fc442d94acd751f6d6fe97fab71b882a9a089397691b0` |
| A | `packages/scope/src/credential-store.ts` | `3e455bd3247bc77307ede62f12ae988b388b4114` | 11852 | `34b47ffe8af1e2d2dfa8b4d16e30b76f34fec17e14dd2c601a54a2e6a70ec897` |
| A | `packages/scope/src/destination-host.ts` | `0c9767d0c2a9a743101b5144ee6dbd7843317c1b` | 23156 | `69f95e4be32b3b90ab40cec03c75a385ace45baadfd198a6ba512e09f77caac3` |
| A | `packages/scope/src/github-host.ts` | `0077c9e707c2e41fc6d25f15ea5ef6e78fc9ca1a` | 18936 | `50b23cc526658e620254fe96995ba0205a52447eaaf2d938101df0e27c9547d9` |
| A | `packages/scope/src/github-wiring.ts` | `acd0271323cb753450db3ad09d397ce349e36424` | 12609 | `53be7e1254144f0b410d62ac42b84916b50ebcb50aab76d90feb90cf3f73ab01` |
| M | `packages/scope/src/index.ts` | `a6ee5a2ead252ef6e0d81b6db7571b6114a1735c` | 545 | `4f81cb86f454e867db770f21859db31ffc5e0b6130afb3215098d22941b54d20` |
| M | `packages/scope/src/object.ts` | `4959b0fb194299c1e9748dbd8658758a8b767d9f` | 22636 | `c0afa685277aa2fc037a63148d8de6fabb59bad3a6fcd92414cbcb459733bb83` |
| M | `packages/scope/src/operations.ts` | `c0f3c730461a11ab9a8371bc711861860f3fff25` | 37258 | `629232ba8c036347dc02237cdeea69924a0b7fd860c10c89f43c72f7f0f5a794` |
| M | `packages/scope/src/reads.ts` | `53bf893424b49251886217a518ddd3026f953983` | 17451 | `94a8deb76cde1362c3620769de6f6dc3428c56c6a03202e74845bbaa15d13175` |
| A | `packages/scope/src/register-host.ts` | `726df79f4c5279322cf02c75514e46098f900ec2` | 7865 | `256c42db694eab586cb1d4de7b13c969d18526a6231aee2734b40f732cda5c86` |
| A | `packages/scope/src/signed-reads.ts` | `26a34a7dcf91c2e9b8babc0a79f737395267eecb` | 11697 | `1af93daad2d049537141461271cb6ff8c81008599b3136b27dee2c9d0a5c9027` |
| M | `packages/scope/src/worker.ts` | `ccaec5369678eefb3598db466d0681e32fc5f72a` | 25337 | `bf57e29b5df107b281310c161afa182f7b0fafd784847c02ab44453f95acd096` |
| A | `packages/scope/test/credential-store.test.ts` | `4f25471ed158386750ed70baa44dbb30c301971b` | 7090 | `80438ccf5b69c43976ede62e1f34fe8cc5d23a59e1f9e0a124cf0e860e28a230` |
| A | `packages/scope/test/destination-host.test.ts` | `b2e8208e6f2653db60f667e7182bf3e711336c05` | 20565 | `88a325a1af0819d12a1a8f3231221f8d90f5644570560e0d16ae1a2ccebf63ff` |
| M | `packages/scope/test/founding-real.test.ts` | `d8cce53e0f50227e997078361b3b503abd0e09d3` | 36436 | `01d5edf5c15ebab494f4a577b4c45528b8d9e2e8c91ced2001772120d0679603` |
| A | `packages/scope/test/github-founding.test.ts` | `0d1c49dd51123949252c629128293c4fd440b011` | 16880 | `d89045107ce44c50117517d4feb6b267af4491fa2e9a33b04205db0d59ed05ae` |
| A | `packages/scope/test/github-host.test.ts` | `7b9d38eb1e44bb0cbe4cb5e4a6d53fa4ffb5b6ef` | 11198 | `8275c6b2a652594a8ee371ee6ae39d2c0f5e225b5fa2e4ed5429a80f35d19923` |
| A | `packages/scope/test/github-wiring.test.ts` | `d9b0fc61236f61a13f74e8d3201de515e7bfba24` | 12660 | `8bb4594c03710f0994669845d017af3b39ee4b00f298d057c2b86cb9d66732b6` |
| M | `packages/scope/test/limits.test.ts` | `be0d5ee770c5ca2c1e961f155249a3c111c7d702` | 10156 | `03330d89fc41613e928648df86fa802826cb978dca0763760ab7c2e2ff265dcf` |
| M | `packages/scope/test/operations.test.ts` | `8b7d1e898ac5115968938983b9f5094d6b6b403b` | 33679 | `16118ed9c8e4206f67c8b53e68debd95e9f1572944d019c097c20856e635bbb2` |
| A | `packages/scope/test/register-host.test.ts` | `ee853209ebd27d881122d1c7d80b283bb3f98b67` | 9230 | `a01caebf445582c6f8c3192c16da9794a5bb0e85819ce8ca684bb45b6f5de487` |
| A | `packages/scope/test/signed-reads.test.ts` | `3f40c8d4aeae628ff2afd38b767efaf852d9cde2` | 19504 | `50b60241238160bb69f685db703d0fae5e9ba2268769a3197968a9c1ff0d9b83` |
| M | `packages/scope/test/worker.ts` | `b59f0aa18c5beaf9ffa48b143d9e6520ed7c2864` | 7928 | `0954d1d1178b5e981c8495ec8e9598ee0ac4fb07f32a6c0b0db174fa65eaee10` |
| M | `scripts/active-source.test.mjs` | `0fca297fe7d6b5fb5a7127211b4273b0fb0b4dac` | 6351 | `a97ba3a10285ad35abf10759d3e892b11b12ff0a270edcc6221b68b8014a2eeb` |
| A | `scripts/demo-git-host.mjs` | `aa17ad0c986202ce2a6a3b8ca6a5d5a6810af794` | 15243 | `2de180e1ee26a61366e45932e548b587b4b6a2aadd4653988552dc94cca3a400` |
| A | `scripts/demo-git-host.test.mjs` | `56300c046fe4e1af566166d6bd00e7167005f6e4` | 5728 | `32ea6773259efd0ece3106f606b6167ae0b12e2545af69af7c01ddc58025d141` |
| M | `vitest.config.ts` | `a4b4334eaa0cb1e01519a06ee9b558873e1e3694` | 2282 | `3c45b601d7cd30a1b219a26eacc7fcff88993709eb72fa2967ac533df57ab9fc` |
