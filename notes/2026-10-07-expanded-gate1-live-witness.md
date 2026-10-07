# Expanded Gate 1 live witness

Builder ran this on 7 October 2026 against an isolated Worker, preserving the
planner's existing demo deployment. Requests: `225da894` / producer
`f8a56f1c`, and `4d8d543f` / producer `3be19128`.

## Exact source and deployment

Gated source `6621284d7f55c275f33dba10f49e4da0ccc9398e` passed 781 tests
and six active-source checks. Deployment used notes-only successor
`3c5b117918206f20047111916399a58b6894101c`, with identical packages tree
`d485f8afd69fa939f75ce30f3c2f5a5e3176e6e3` and scripts tree
`c7ffb21b9435e2a7985a2bd0492c72dce1047787`.

Worker: `https://artroom-scope-review-g1.inguz.workers.dev`.
Source deployment version: `a9419198-1212-45dc-9ae9-f2d2b92047be`.
Pinned Wrangler 4.147.0 ran from `/tmp`, without checkout dependency edits.
Deploy took 6.516 seconds. Session configuration and hosting configuration
were applied afterward; real authenticated commands below confirm their use.
The ARTIFACTS binding uses namespace `artroom-demo`, an 8 MiB max and
adapter-attempt credential identity. No GitHub creation credential or other
outside repository credential was configured for this Worker.

A redundant attempt to set DEPLOYMENT as a secret was refused because its
plain binding already existed. It did not prevent session issuance or reads.
Secret values, signing keys and credential files are excluded from this packet.

## Install and claim

Builder used a new local CLI home and new operator/recovery keys. Install with
`--host artifacts --namespace artroom-demo` exited 0 in 1.307 seconds.
Claim `review-g1 --handle @builder` exited 0 in 8.880 seconds; directory,
membership, rules, destination and inbox were created and confirmed, with
first admin and key active. The operator is builder, not a human usability
participant.

| Scope | Identifier | Incarnation |
| --- | --- | --- |
| Register | `sc_bwt7xzge66mw4u3ykzb2glluc3j3ivgs6zgak6msvjhbxuhr5dha` | `in_neakky7y3b3gz6flc3aa7hhquy` |
| Directory | `sc_hn5k3u3vikumouuxay4hjplow4p2jtqljckvfvrcpiqom74opxkq` | `in_sny6vuwttwq5fmursjjwl3cbvq` |
| Membership | `sc_4skaxs5gohe3s7nugabzzpcxpmcabdlqd57gqeixpcrgdl7dem2q` | `in_spvkjierpdxhcypggooivwsnni` |
| Rules | `sc_ijsusk26b325hgvqff3pegjkizilw2sxn5qpuz4torek5rd3wtta` | `in_l5unq4nwsu43q5bjcwoq5axuge` |
| Destination | `sc_c3oiwaqb626ckvijfvf2fzokxry7rhldlpusw3q7qr5cn2eem4aa` | `in_gfbevku5oqhve74fv36tlz3zam` |
| Inbox | `sc_22dnrfk4k72d2tnp2qo43prkmr7rqncft3tmaifw66gom43djxsq` | `in_araxygti7tswzryckwts3htv2e` |

## Authenticated replay

All six CLI commands exited 0 and reported consistent. Each report folded
history from genesis, comparing derived guards, effects and sends within
its stated coverage. None used anchors; none reported missing foreign facts.
Reports were read in full by builder.

| Target | Target coverage | Foreign facts replayed | Other scope coverage |
| --- | --- | --- | --- |
| Register | 0–3 | 3 | Directory 0 |
| Directory | 0–4 | 7 | Register 0–3; membership, rules, destination 0 |
| Membership | 0–4 | 8 | Directory 0–2; register 0–3; inbox 0 |
| Rules | 0–1 | 7 | Directory 0–3; register 0–3; membership 0 |
| Destination | 0–7 | 8 | Directory 0–4; register 0–3; membership and rules 0 |
| Inbox | 0–1 | 9 | Membership 0–4; directory 0–2; register 0–3 |

Replay still trusts recorded service clocks, delivery times, incarnation
uniqueness, no dispatch before provisional confirmation, supplied bounds,
and the named platform rules' correspondence to code. It trusts the service's
heads and source histories because no known-head receipt or anchor was supplied.
Outside-write outcomes, own-answer attribution and host-read answers are
accepted as recorded. The separate real clone below observes the repository
outside the replay boundary; replay alone does not prove the outside write.
This single-room run does not settle the retained-genesis dependency gap in
unanchored multiple-cofounder register replay.

## Real Git clone

An operator issued a repo-scoped `read` token with requested TTL 120 seconds.
The host reported `read` scope and expiry `2026-10-07T16:30:45.331Z`.
The token stayed in process memory and a Git environment header; its value
was not written to this report, command arguments or repository configuration.
No explicit revoke command was available in the Wrangler repository commands;
the observed expiry is recorded, without claiming an explicit revocation.

Remote:
`https://6e953d231f1c9aadffbf59537a82e13a.artifacts.cloudflare.net/git/artroom-demo/hn5k3u3vikumouuxay4hjplow4p2jtqljckvfvrcpiqom74opxkq-1.git`.

Git clone exited 0; issuance plus clone took 3.841 seconds. HEAD and `main`
are `deb39648e7622493c5e7b80d0213cd443531cdd4`; subject is
“Found this repository.” Tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904`
is empty. No content-change or native lane publication is claimed.
This operator token is a labelled stand-in for the separately commissioned
room read-token/CLI clone flow; no fresh-person signoff is claimed.

## Direct publication, cleanup and deployed-settings evidence

The deployment listing records initial source upload `a9419198` at
16:18:10.914 UTC, session-secret successor
`ae1710fa-c9e6-4f58-a1e1-888699c19461` at 16:18:58.323, and hosting-config
successor `8694dade-1530-4d49-a80a-bfab114b3e08` at 16:20:10.440.
The final configured version served the claim and subsequent authenticated
reads. These settings successors preserve the uploaded executable source;
no assertion that the initial upload UUID remained the active version is made.

Builder read authenticated register and destination history at 16:38:08.171
UTC and retained their sealed entries, without credential plaintext.
Register entry 2 at 16:20:57.353 confirms creation of the exact repository
name above on attempt 1; entry 3 confirms the directory result and active
claim. Register entry 2 contains no creation-token handle and no separate
cleanup outcome. The adapter's own create method revokes its short-lived
creation token before returning confirmation; that cleanup is a source and
own-answer boundary, not an independently queried provider revocation log.

Destination operations are all attempt 1:

| Entry | Recorded time (UTC) | Result |
| --- | --- | --- |
| 2 | 16:21:00.685 | Mint confirmed, reported expiry 16:36:00.780; only adapter handle recorded |
| 3 | 16:21:01.989 | First-head confirmed, seen `deb39648e7622493c5e7b80d0213cd443531cdd4`; branch ready, receipt owed |
| 4 | 16:21:02.120 | First-head token revoke confirmed |
| 5 | 16:21:02.127 | Receipt token mint confirmed, reported expiry 16:36:02.306 |
| 6 | 16:21:03.028 | Receipt confirmed, seen `1d152241020c73adc3fbd8b6166674ff0a76001f`; receipt written |
| 7 | 16:21:03.174 | Receipt token revoke confirmed |

These entries are accepted outside-system answers recorded by the service;
replay does not separately verify the provider's revocation side effect.
Their hashes match the stated replay coverage, including destination entry 7
`sha256:9a7ce831befbc5d482edf62bccee8fffef9cd7e3bcdfbfcb2fa0e592453e0deb`.

A second operator-token clone retained actual Git stdout/stderr, followed by
`git ls-remote` on the same authenticated remote. Both exited 0. Issuance and
clone took 2.459 seconds; the new reported read-token expiry was
16:40:35.713 UTC, again requested TTL 120 seconds. Git advertised the exact
founding head plus receipt commit `1d152241020c73adc3fbd8b6166674ff0a76001f`
at `refs/artroom/receipts/1115b8fa894fc51c75edadc137d687be0e2f213d5f8f9ef004c14b526c74ac56`.
The first clone's metadata is preserved above; this second observation adds
raw command output and receipt-ref corroboration. Neither clone is the
later room-issued CLI credential flow.

## Evidence index

These logs contain command outcomes and replay reports. They exclude token
values and private key material. Clone JSON contains safe result metadata only.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `/tmp/artroom-expanded-review-deploy.log` | 776 | `e8745a393035de47346be3546f21ea3ad248166ff499c6c81613d78c54c3902b` |
| `/tmp/artroom-expanded-review-session-put.log` | 305 | `186600f3a3e1eed8191a117b8cafa3c22636610b8541fb93e6243e2d63435592` |
| `/tmp/artroom-expanded-review-artifacts-put.log` | 307 | `435b3aee587b3683c5e86a1bdc1659b39ceee466eb10b20170e6fe698aa7a403` |
| `/tmp/artroom-expanded-review-install.log` | 224 | `e37e28e73ea945a523ab51da10f533ba96f3a0f8a64bc2c88803ec9c9aacdc78` |
| `/tmp/artroom-expanded-review-claim.log` | 469 | `da2ef038f4eec75f663a7c32e8442f9ae43101a8299ed90ae6f64e41c5d71f5c` |
| `/tmp/artroom-expanded-review-verify-register.log` | 1879 | `83889186eaad501298db41f99182fd5cbbc89ee61d1e527f932d76fb7c6724d8` |
| `/tmp/artroom-expanded-review-verify-directory.log` | 2610 | `e3244e5af19a9d3558fc494cbdde8d200b3a445d07a982b4a55704b5f25f5b4c` |
| `/tmp/artroom-expanded-review-verify-membership.log` | 2363 | `0088c57fbfc8675e2ba6dffacb33e3362902ef29a4833274547e24efded5dddc` |
| `/tmp/artroom-expanded-review-verify-rules.log` | 2358 | `6c4146f3aaeaf640d0e7e3b7438f59e031ba641d3ef39698d6c78344b4d1c1c6` |
| `/tmp/artroom-expanded-review-verify-destination.log` | 2612 | `be32cd3056944166be8f89e78830252dcf790447a4669edca1b4cf8decf296b3` |
| `/tmp/artroom-expanded-review-verify-inbox.log` | 2358 | `2ca725ed6fc2e59c527a49010566e5285625f8e6c5b209cb363ab62219458ecc` |
| `/tmp/artroom-expanded-review-clone.json` | 902 | `aba73fd6f6ab034174fdbef11e826b07782972159028c2eaf24505c074c9f4b0` |

| `/tmp/artroom-expanded-review-deployments.log` | 1057 | `3699c0a6bc48472de7409ddf2a282470a88cc352ee09ed4a4856d93712fa6c90` |
| `/tmp/artroom-expanded-review-live-entries.json` | 37666 | `354c98f6552407a33cb6f25993739ea6ae451808aaed3e467f6a9b1f2af2a16b` |
| `/tmp/artroom-expanded-review-clone-raw.json` | 1363 | `4a0381944adaa84af3c8de1c14eaac5d7da8b4fa912451db7cf602134d28a188` |

This witness is producer evidence for exact independent source/evidence review.
It grants no source approval, request closure, receipt or main landing.
