# Demo rehearsal transcript

Base URL https://artroom-scope.inguz.workers.dev, host github.com, namespace generalbusiness-ai. Started 2026-10-08T23:45:20.994Z. Run by scripts/demo-run.ts under Node v26.10.0, room rehearsal-github-20261008-1945, config directories under /tmp/artroom-github-rehearsal-20261008-1945.

Result: all 26 shots printed what the script expects.

Invitation links are cut to their first eight letters; nothing else printed holds a secret.

## Shot 1. Plan the install

Script shot 3. As the founder (@hugh), at 2026-10-08T23:45:20.994Z, 234.2 seconds.

```text
$ artroom install --plan https://artroom-scope.inguz.workers.dev --host github.com --namespace generalbusiness-ai
Planned: register sc_shtel2ujlpw4md4c3ke7uvegoacjuzbp7mn3ttdcwvwokwkwo72a, under platform:register@2, on host github.com, namespace generalbusiness-ai. The seed's time is 2026-10-08T23:59:21Z.
Set registerScope to sc_shtel2ujlpw4md4c3ke7uvegoacjuzbp7mn3ttdcwvwokwkwo72a in the Worker's host setting, then run artroom install --planned before 2026-10-08T23:59:21Z.
```

Exit 0. Matches the expected lines.

The operator confirmed GITHUB_APP_CONFIG.registerScope = sc_shtel2ujlpw4md4c3ke7uvegoacjuzbp7mn3ttdcwvwokwkwo72a by pressing Enter after 234 seconds. The runner did not inspect the deployment's setting.

## Shot 2. Install as planned

Script shot 3. As the founder (@hugh), at 2026-10-08T23:49:15.178Z, 0.7 seconds.

```text
$ artroom install --planned
Installed: register sc_shtel2ujlpw4md4c3ke7uvegoacjuzbp7mn3ttdcwvwokwkwo72a, under platform:register@2, as planned.
Service-acknowledged identity recovery. The original plan and receipt are retained for later history verification.
```

Exit 0. Matches the expected lines.

## Shot 3. Claim the room

Script shot 3. As the founder (@hugh), at 2026-10-08T23:49:15.890Z, 7.3 seconds.

```text
$ artroom claim rehearsal-github-20261008-1945 --handle @hugh
Claimed rehearsal-github-20261008-1945: directory sc_6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra, membership sc_fln4dy6prpwt65olchwdyfrl5x5mz7t7horj2e3synuu2mxazeva, rules sc_mo2tabx7vy4koblfedkzshjxryduujrzpbzwqegdb5zetupe36wa, destination sc_lv4wyiopxa7xzpcb7brnjzz7wyrrnokugcvgnad2kisxxdunvyqa; each created and confirmed.
Definitions: platform:directory@2, platform:membership@2, platform:rules@2, platform:destination@2.
You are @hugh, an admin, on key key_YMJPgNXTBrlEEC5s4qB09BPnsuSg02kojJ-ubY-x2sg; your inbox is sc_sktnjn4fmzhhjd636qifmuu3x6rbatrr2u22f2l53rwrri6tquaa.
```

Exit 0. Matches the expected lines.

## Shot 4. Publish the rules

Script shot 6, recording-day checklist. As the founder (@hugh), at 2026-10-08T23:49:23.165Z, 0.5 seconds.

```text
$ artroom act publish --on rules --target 0 --set approvals=0 --set ownerMayReview=false --set 'checks=[]' --set 'labels=[]' --set 'extents=[{"name":"rules","patterns":["**/AGENTS.md","**/CLAUDE.md",".github/workflows/**",".github/actions/**"],"approvals":1,"approver":"rules.publish","checks":[],"class":"authority"},{"name":"infrastructure","patterns":["**/.gitignore","**/.gitattributes",".github/**"],"approvals":0,"approver":"change.merge","checks":[],"class":"deployment"},{"name":"source","patterns":[],"approvals":0,"approver":"change.review","checks":[],"class":"content"}]'
Took effect: entry sc_mo2tabx7vy4koblfedkzshjxryduujrzpbzwqegdb5zetupe36wa:2, hash sha256:101a98993e27.
```

Exit 0. Matches the expected lines.

## Shot 5. Activate the issue definition

Script shot 6, recording-day checklist. As the founder (@hugh), at 2026-10-08T23:49:23.700Z, 0.4 seconds.

```text
$ artroom act activate --on rules --set digest=sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e --set name=issue --value issue-demo.json
Took effect: entry sc_mo2tabx7vy4koblfedkzshjxryduujrzpbzwqegdb5zetupe36wa:3, hash sha256:f5f82367b721.
```

Exit 0. Matches the expected lines.

## Shot 6. Activate the change definition

Script shot 6, recording-day checklist. As the founder (@hugh), at 2026-10-08T23:49:24.087Z, 0.4 seconds.

```text
$ artroom act activate --on rules --set digest=sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2 --set name=change --value change-demo.json
Took effect: entry sc_mo2tabx7vy4koblfedkzshjxryduujrzpbzwqegdb5zetupe36wa:4, hash sha256:076a0f601337.
```

Exit 0. Matches the expected lines.

## Shot 7. Invite a member

Script shot 4. As the founder (@hugh), at 2026-10-08T23:49:24.471Z, 0.3 seconds.

```text
$ artroom invite @una --role member
Invited @una as member: invitation sc_fln4dy6prpwt65olchwdyfrl5x5mz7t7horj2e3synuu2mxazeva:5, until 2026-10-09T23:49:24Z.
Link for @una only (it holds the invitation's secret): artroom-invite:eyJ2Ijox... (cut: the link holds a secret)
```

Exit 0. Matches the expected lines.

## Shot 8. The member joins

Script shot 5. As the member (@una), at 2026-10-08T23:49:24.767Z, 1.6 seconds.

```text
$ artroom join artroom-invite:eyJ2Ijox... (cut: the link holds a secret)
Joined as @una on key key_nk_zTREU5mNcbQ5tu6isJb7U8-kiZAEXk9htqOjyjjY.
Your inbox: sc_wqg53qjhgo736hjbxf7vgke4qdqtnywwcnvxca3w6h5x2ncxsaaa.
```

Exit 0. Matches the expected lines.

## Shot 9. Invite a maintainer

Script shot 4. As the founder (@hugh), at 2026-10-08T23:49:26.328Z, 0.3 seconds.

```text
$ artroom invite @paul --role maintainer
Invited @paul as maintainer: invitation sc_fln4dy6prpwt65olchwdyfrl5x5mz7t7horj2e3synuu2mxazeva:8, until 2026-10-09T23:49:26Z.
Link for @paul only (it holds the invitation's secret): artroom-invite:eyJ2Ijox... (cut: the link holds a secret)
```

Exit 0. Matches the expected lines.

## Shot 10. The maintainer joins

Script shot 5. As the maintainer (@paul), at 2026-10-08T23:49:26.585Z, 1.5 seconds.

```text
$ artroom join artroom-invite:eyJ2Ijox... (cut: the link holds a secret)
Joined as @paul on key key_AdlBsEULxOz97S8DPmK1hX1AoR50gA9HyOuxfIrxL_E.
Your inbox: sc_4ezgfdvguywh7vjgmfs5izyluzrqyutrp6ybmnqn2ub7ldrvzlkq.
```

Exit 0. Matches the expected lines.

## Shot 11. Clone by the room's token

Script shot 6. As the member (@una), at 2026-10-08T23:49:28.085Z, 2.3 seconds.

```text
$ artroom clone site
Read token: sc_lv4wyiopxa7xzpcb7brnjzz7wyrrnokugcvgnad2kisxxdunvyqa:10, until 2026-10-09T00:49:28Z.
Remote URL: https://github.com/generalbusiness-ai/6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra-1.git
Cloned into site.
```

Exit 0. Matches the expected lines.

## Shot 12. The clone's history

Script shot 6. As the member (@una), at 2026-10-08T23:49:30.353Z, 0 seconds.

```text
$ git -C site log --oneline
220e521 Found this repository.
```

Exit 0. Matches the expected lines.

## Shot 13. Open an issue

Script shot 8 (the issue it closes). As the member (@una), at 2026-10-08T23:49:30.362Z, 1.9 seconds.

```text
$ artroom issue open --title 'Add a getting-started page' --body 'A page that says how to clone and edit.'
Opened issue #1: Add a getting-started page. Its lane is sc_kr3xlpxfownbjje5yqcjvfabdevrofkktywe3jdup66db26y3xna.
```

Exit 0. Matches the expected lines.

## Shot 14. Comment on it

Script shot 8. As the maintainer (@paul), at 2026-10-08T23:49:32.298Z, 0.6 seconds.

```text
$ artroom issue comment 1 'I will take this.'
Commented: entry sc_kr3xlpxfownbjje5yqcjvfabdevrofkktywe3jdup66db26y3xna:2, hash sha256:34ec341fc535.
```

Exit 0. Matches the expected lines.

## Shot 15. Assign it

Script shot 8. As the founder (@hugh), at 2026-10-08T23:49:32.896Z, 0.7 seconds.

```text
$ artroom issue assign 1 @paul
Assigned: entry sc_kr3xlpxfownbjje5yqcjvfabdevrofkktywe3jdup66db26y3xna:3, hash sha256:4545e898d277.
```

Exit 0. Matches the expected lines.

## Shot 16. Edit a page in an open folder, closing the issue

Script shot 8. As the maintainer (@paul), at 2026-10-08T23:49:33.597Z, 24.4 seconds.

```text
$ artroom edit guide/start.md --file start.md --closes 1
Proposed guide/start.md (53 bytes) as change sc_2yltqszyakomf67nvl2v3grkjikdppuffpzrbsjkytwywh3gshla, version 5.
Linked: when it is published, the change sc_2yltqszyakomf67nvl2v3grkjikdppuffpzrbsjkytwywh3gshla closes issue #1 (sc_kr3xlpxfownbjje5yqcjvfabdevrofkktywe3jdup66db26y3xna).
Published: commit 800f34199fe011dd9c52ec7f49400521a48a93fa, by the merge sc_2yltqszyakomf67nvl2v3grkjikdppuffpzrbsjkytwywh3gshla:8.
Page: https://artroom-scope.inguz.workers.dev/site/sc_6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra/HEAD/guide/start.md
```

Exit 0. Matches the expected lines.

## Shot 17. Edit in a controlled folder: refused by name

Script shot 10. As the maintainer (@paul), at 2026-10-08T23:49:57.956Z, 6.6 seconds.

```text
$ artroom edit AGENTS.md --file agents.md
Proposed AGENTS.md (31 bytes) as change sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq, version 5.
Not published: the merge sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq:6 is refused, rules-not-met:rules. The change sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq stays open at version 5. When it may be merged, run: artroom merge sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq
```

Exit 1. Matches the expected lines.

## Shot 18. The rules scope's controller approves

Script shot 11. As the founder (@hugh), at 2026-10-08T23:50:04.552Z, 0.5 seconds.

```text
$ artroom act review-verdict --on sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq --set manifest=5 --set verdict=approve --set extent=rules
Took effect: entry sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq:9, hash sha256:0af19579ae95.
```

Exit 0. Matches the expected lines.

## Shot 19. Merge: it publishes

Script shot 11. As the maintainer (@paul), at 2026-10-08T23:50:05.007Z, 4.8 seconds.

```text
$ artroom merge sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq
Published: commit b6935ea30e96f805319885f3945c5a55c292f713, by the merge sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq:10.
Page: https://artroom-scope.inguz.workers.dev/site/sc_6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra/HEAD/AGENTS.md
```

Exit 0. Matches the expected lines.

## Shot 20. The bad path: refused by name

Script shot 10 (the bad path of the 19:50 run). As the maintainer (@paul), at 2026-10-08T23:50:09.844Z, 6.4 seconds.

```text
$ artroom edit ../outside.md --file start.md
Proposed ../outside.md (53 bytes) as change sc_fgstiswxjyeeoc2qgixy6qwh2bg6zi7p65rmael4zb73dd3qqmjq, version 5.
Not published: the merge sc_fgstiswxjyeeoc2qgixy6qwh2bg6zi7p65rmael4zb73dd3qqmjq:6 is refused, path-invalid. The change sc_fgstiswxjyeeoc2qgixy6qwh2bg6zi7p65rmael4zb73dd3qqmjq stays open at version 5. When it may be merged, run: artroom merge sc_fgstiswxjyeeoc2qgixy6qwh2bg6zi7p65rmael4zb73dd3qqmjq
```

Exit 1. Matches the expected lines.

## Shot 21. The issues: closed by the merge

Script shot 8. As the member (@una), at 2026-10-08T23:50:16.206Z, 0.2 seconds.

```text
$ artroom issues
#1  closed (completed)  Add a getting-started page; assigned to @paul; lane sc_kr3xlpxfownbjje5yqcjvfabdevrofkktywe3jdup66db26y3xna
1 issues, 0 open.
```

Exit 0. Matches the expected lines.

## Shot 22. The verifier, every scope

Script shot 12. As the member (@una), at 2026-10-08T23:50:16.451Z, 60.9 seconds.

```text
$ artroom verify --all
register sc_shtel2ujlpw4md4c3ke7uvegoacjuzbp7mn3ttdcwvwokwkwo72a, entry 3: consistent.
directory sc_6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra, entry 25: consistent.
membership sc_fln4dy6prpwt65olchwdyfrl5x5mz7t7horj2e3synuu2mxazeva, entry 10: consistent.
rules sc_mo2tabx7vy4koblfedkzshjxryduujrzpbzwqegdb5zetupe36wa, entry 10: consistent.
destination sc_lv4wyiopxa7xzpcb7brnjzz7wyrrnokugcvgnad2kisxxdunvyqa, entry 43: consistent.
lane sc_kr3xlpxfownbjje5yqcjvfabdevrofkktywe3jdup66db26y3xna, entry 5: consistent.
lane sc_2yltqszyakomf67nvl2v3grkjikdppuffpzrbsjkytwywh3gshla, entry 13: consistent.
lane sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq, entry 14: consistent.
lane sc_fgstiswxjyeeoc2qgixy6qwh2bg6zi7p65rmael4zb73dd3qqmjq, entry 8: consistent.
inbox sc_sktnjn4fmzhhjd636qifmuu3x6rbatrr2u22f2l53rwrri6tquaa, entry 1: consistent.
inbox sc_wqg53qjhgo736hjbxf7vgke4qdqtnywwcnvxca3w6h5x2ncxsaaa, entry 1: consistent.
inbox sc_4ezgfdvguywh7vjgmfs5izyluzrqyutrp6ybmnqn2ub7ldrvzlkq, entry 1: consistent.
All consistent: 12 scopes.
```

Exit 0. Matches the expected lines.

## Shot 23. The site's front page

Script shot 7. As the member (@una), at 2026-10-08T23:51:17.311Z, 0.5 seconds.

```text
$ GET https://artroom-scope.inguz.workers.dev/site/sc_6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra/HEAD/
HTTP 200, text/html; charset=utf-8
Title: 6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra-1
```

Exit 0. Matches the expected lines.

## Shot 24. The page published by the edit

Script shot 9. As the member (@una), at 2026-10-08T23:51:17.846Z, 0.5 seconds.

```text
$ GET https://artroom-scope.inguz.workers.dev/site/sc_6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra/HEAD/guide/start.md
HTTP 200, text/html; charset=utf-8
Title: Getting started
Shows: "Clone the room, then edit a page."
```

Exit 0. Matches the expected lines.

## Shot 25. The page published after the approval

Script shot 11. As the member (@una), at 2026-10-08T23:51:18.354Z, 0.2 seconds.

```text
$ GET https://artroom-scope.inguz.workers.dev/site/sc_6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra/HEAD/AGENTS.md
HTTP 200, text/html; charset=utf-8
Title: Agents
Shows: "Ask before you push."
```

Exit 0. Matches the expected lines.

## Shot 26. The room's page

Script shot the story page. As the member (@una), at 2026-10-08T23:51:18.590Z, 0 seconds.

```text
$ GET https://artroom-scope.inguz.workers.dev/page/
HTTP 200, text/html; charset=utf-8
Title: Artroom page
```

Exit 0. Matches the expected lines.

## Expected and observed

In an expected line, `<name>` is any text without a space, `<...>` any text, and `{name}` the value an earlier line printed.

| Shot | Expected | Observed | Match |
|---|---|---|---|
| 1. Plan the install | exit 0<br>Planned: register &lt;register>, under &lt;registerDefinition>, on host github.com, namespace generalbusiness-ai. The seed's time is &lt;until>.<br>Set registerScope to {register} in the Worker's host setting, then run artroom install --planned before {until}. | exit 0<br>Planned: register sc_shtel2ujlpw4md4c3ke7uvegoacjuzbp7mn3ttdcwvwokwkwo72a, under platform:register@2, on host github.com, namespace generalbusiness-ai. The seed's time is 2026-10-08T23:59:21Z.<br>Set registerScope to sc_shtel2ujlpw4md4c3ke7uvegoacjuzbp7mn3ttdcwvwokwkwo72a in the Worker's host setting, then run artroom install --planned before 2026-10-08T23:59:21Z. | yes |
| 2. Install as planned | exit 0<br>Installed: register {register}, under {registerDefinition}, as planned.<br>Service-acknowledged identity recovery. The original plan and receipt are retained for later history verification. | exit 0<br>Installed: register sc_shtel2ujlpw4md4c3ke7uvegoacjuzbp7mn3ttdcwvwokwkwo72a, under platform:register@2, as planned.<br>Service-acknowledged identity recovery. The original plan and receipt are retained for later history verification. | yes |
| 3. Claim the room | exit 0<br>Claimed rehearsal-github-20261008-1945: directory &lt;directory>, membership &lt;membership>, rules &lt;rules>, destination &lt;destination>; each created and confirmed.<br>Definitions: &lt;...>.<br>You are @hugh, an admin, on key {operatorKey}; your inbox is &lt;founderInbox>. | exit 0<br>Claimed rehearsal-github-20261008-1945: directory sc_6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra, membership sc_fln4dy6prpwt65olchwdyfrl5x5mz7t7horj2e3synuu2mxazeva, rules sc_mo2tabx7vy4koblfedkzshjxryduujrzpbzwqegdb5zetupe36wa, destination sc_lv4wyiopxa7xzpcb7brnjzz7wyrrnokugcvgnad2kisxxdunvyqa; each created and confirmed.<br>Definitions: platform:directory@2, platform:membership@2, platform:rules@2, platform:destination@2.<br>You are @hugh, an admin, on key key_YMJPgNXTBrlEEC5s4qB09BPnsuSg02kojJ-ubY-x2sg; your inbox is sc_sktnjn4fmzhhjd636qifmuu3x6rbatrr2u22f2l53rwrri6tquaa. | yes |
| 4. Publish the rules | exit 0<br>Took effect: entry {rules}:&lt;seq>, hash &lt;hash>. | exit 0<br>Took effect: entry sc_mo2tabx7vy4koblfedkzshjxryduujrzpbzwqegdb5zetupe36wa:2, hash sha256:101a98993e27. | yes |
| 5. Activate the issue definition | exit 0<br>Took effect: entry {rules}:&lt;seq>, hash &lt;hash>. | exit 0<br>Took effect: entry sc_mo2tabx7vy4koblfedkzshjxryduujrzpbzwqegdb5zetupe36wa:3, hash sha256:f5f82367b721. | yes |
| 6. Activate the change definition | exit 0<br>Took effect: entry {rules}:&lt;seq>, hash &lt;hash>. | exit 0<br>Took effect: entry sc_mo2tabx7vy4koblfedkzshjxryduujrzpbzwqegdb5zetupe36wa:4, hash sha256:076a0f601337. | yes |
| 7. Invite a member | exit 0<br>Invited @una as member: invitation {membership}:&lt;seq>, until &lt;until>.<br>Link for @una only (it holds the invitation's secret): &lt;memberLink> | exit 0<br>Invited @una as member: invitation sc_fln4dy6prpwt65olchwdyfrl5x5mz7t7horj2e3synuu2mxazeva:5, until 2026-10-09T23:49:24Z.<br>Link for @una only (it holds the invitation's secret): artroom-invite:eyJ2Ijox... (cut: the link holds a secret) | yes |
| 8. The member joins | exit 0<br>Joined as @una on key &lt;memberKey>.<br>Your inbox: &lt;memberInbox>. | exit 0<br>Joined as @una on key key_nk_zTREU5mNcbQ5tu6isJb7U8-kiZAEXk9htqOjyjjY.<br>Your inbox: sc_wqg53qjhgo736hjbxf7vgke4qdqtnywwcnvxca3w6h5x2ncxsaaa. | yes |
| 9. Invite a maintainer | exit 0<br>Invited @paul as maintainer: invitation {membership}:&lt;seq>, until &lt;until>.<br>Link for @paul only (it holds the invitation's secret): &lt;maintainerLink> | exit 0<br>Invited @paul as maintainer: invitation sc_fln4dy6prpwt65olchwdyfrl5x5mz7t7horj2e3synuu2mxazeva:8, until 2026-10-09T23:49:26Z.<br>Link for @paul only (it holds the invitation's secret): artroom-invite:eyJ2Ijox... (cut: the link holds a secret) | yes |
| 10. The maintainer joins | exit 0<br>Joined as @paul on key &lt;maintainerKey>.<br>Your inbox: &lt;maintainerInbox>. | exit 0<br>Joined as @paul on key key_AdlBsEULxOz97S8DPmK1hX1AoR50gA9HyOuxfIrxL_E.<br>Your inbox: sc_4ezgfdvguywh7vjgmfs5izyluzrqyutrp6ybmnqn2ub7ldrvzlkq. | yes |
| 11. Clone by the room's token | exit 0<br>Read token: {destination}:&lt;seq>, until &lt;until>.<br>Remote URL: &lt;remote><br>Cloned into site. | exit 0<br>Read token: sc_lv4wyiopxa7xzpcb7brnjzz7wyrrnokugcvgnad2kisxxdunvyqa:10, until 2026-10-09T00:49:28Z.<br>Remote URL: https://github.com/generalbusiness-ai/6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra-1.git<br>Cloned into site. | yes |
| 12. The clone's history | exit 0<br>&lt;founding> &lt;...>Found this repository. | exit 0<br>220e521 Found this repository. | yes |
| 13. Open an issue | exit 0<br>Opened issue #1: Add a getting-started page. Its lane is &lt;issue>. | exit 0<br>Opened issue #1: Add a getting-started page. Its lane is sc_kr3xlpxfownbjje5yqcjvfabdevrofkktywe3jdup66db26y3xna. | yes |
| 14. Comment on it | exit 0<br>Commented: entry {issue}:&lt;seq>, hash &lt;hash>. | exit 0<br>Commented: entry sc_kr3xlpxfownbjje5yqcjvfabdevrofkktywe3jdup66db26y3xna:2, hash sha256:34ec341fc535. | yes |
| 15. Assign it | exit 0<br>Assigned: entry {issue}:&lt;seq>, hash &lt;hash>. | exit 0<br>Assigned: entry sc_kr3xlpxfownbjje5yqcjvfabdevrofkktywe3jdup66db26y3xna:3, hash sha256:4545e898d277. | yes |
| 16. Edit a page in an open folder, closing the issue | exit 0<br>Proposed guide/start.md (53 bytes) as change &lt;published>, version &lt;publishedVersion>.<br>Linked: when it is published, the change {published} closes issue #1 ({issue}).<br>Published: commit &lt;publishedCommit>, by the merge {published}:&lt;seq>.<br>Page: https://artroom-scope.inguz.workers.dev/site/{directory}/HEAD/guide/start.md | exit 0<br>Proposed guide/start.md (53 bytes) as change sc_2yltqszyakomf67nvl2v3grkjikdppuffpzrbsjkytwywh3gshla, version 5.<br>Linked: when it is published, the change sc_2yltqszyakomf67nvl2v3grkjikdppuffpzrbsjkytwywh3gshla closes issue #1 (sc_kr3xlpxfownbjje5yqcjvfabdevrofkktywe3jdup66db26y3xna).<br>Published: commit 800f34199fe011dd9c52ec7f49400521a48a93fa, by the merge sc_2yltqszyakomf67nvl2v3grkjikdppuffpzrbsjkytwywh3gshla:8.<br>Page: https://artroom-scope.inguz.workers.dev/site/sc_6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra/HEAD/guide/start.md | yes |
| 17. Edit in a controlled folder: refused by name | exit 1<br>Proposed AGENTS.md (31 bytes) as change &lt;controlled>, version &lt;controlledVersion>.<br>Not published: the merge {controlled}:&lt;seq> is refused, rules-not-met:rules. The change {controlled} stays open at version {controlledVersion}. When it may be merged, run: artroom merge {controlled} | exit 1<br>Proposed AGENTS.md (31 bytes) as change sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq, version 5.<br>Not published: the merge sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq:6 is refused, rules-not-met:rules. The change sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq stays open at version 5. When it may be merged, run: artroom merge sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq | yes |
| 18. The rules scope's controller approves | exit 0<br>Took effect: entry {controlled}:&lt;seq>, hash &lt;hash>. | exit 0<br>Took effect: entry sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq:9, hash sha256:0af19579ae95. | yes |
| 19. Merge: it publishes | exit 0<br>Published: commit &lt;controlledCommit>, by the merge {controlled}:&lt;seq>.<br>Page: https://artroom-scope.inguz.workers.dev/site/{directory}/HEAD/AGENTS.md | exit 0<br>Published: commit b6935ea30e96f805319885f3945c5a55c292f713, by the merge sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq:10.<br>Page: https://artroom-scope.inguz.workers.dev/site/sc_6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra/HEAD/AGENTS.md | yes |
| 20. The bad path: refused by name | exit 1<br>Proposed ../outside.md (53 bytes) as change &lt;refused>, version &lt;refusedVersion>.<br>Not published: the merge {refused}:&lt;seq> is refused, path-invalid. The change {refused} stays open at version {refusedVersion}. When it may be merged, run: artroom merge {refused} | exit 1<br>Proposed ../outside.md (53 bytes) as change sc_fgstiswxjyeeoc2qgixy6qwh2bg6zi7p65rmael4zb73dd3qqmjq, version 5.<br>Not published: the merge sc_fgstiswxjyeeoc2qgixy6qwh2bg6zi7p65rmael4zb73dd3qqmjq:6 is refused, path-invalid. The change sc_fgstiswxjyeeoc2qgixy6qwh2bg6zi7p65rmael4zb73dd3qqmjq stays open at version 5. When it may be merged, run: artroom merge sc_fgstiswxjyeeoc2qgixy6qwh2bg6zi7p65rmael4zb73dd3qqmjq | yes |
| 21. The issues: closed by the merge | exit 0<br>#1  closed (completed)  Add a getting-started page; assigned to @paul; lane {issue}<br>1 issues, 0 open. | exit 0<br>#1  closed (completed)  Add a getting-started page; assigned to @paul; lane sc_kr3xlpxfownbjje5yqcjvfabdevrofkktywe3jdup66db26y3xna<br>1 issues, 0 open. | yes |
| 22. The verifier, every scope | exit 0<br>register {register}, entry &lt;seq>: consistent.<br>directory {directory}, entry &lt;seq>: consistent.<br>membership {membership}, entry &lt;seq>: consistent.<br>rules {rules}, entry &lt;seq>: consistent.<br>destination {destination}, entry &lt;seq>: consistent.<br>lane {issue}, entry &lt;seq>: consistent.<br>lane {published}, entry &lt;seq>: consistent.<br>lane {controlled}, entry &lt;seq>: consistent.<br>lane {refused}, entry &lt;seq>: consistent.<br>inbox {founderInbox}, entry &lt;seq>: consistent.<br>inbox {memberInbox}, entry &lt;seq>: consistent.<br>inbox {maintainerInbox}, entry &lt;seq>: consistent.<br>All consistent: 12 scopes. | exit 0<br>register sc_shtel2ujlpw4md4c3ke7uvegoacjuzbp7mn3ttdcwvwokwkwo72a, entry 3: consistent.<br>directory sc_6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra, entry 25: consistent.<br>membership sc_fln4dy6prpwt65olchwdyfrl5x5mz7t7horj2e3synuu2mxazeva, entry 10: consistent.<br>rules sc_mo2tabx7vy4koblfedkzshjxryduujrzpbzwqegdb5zetupe36wa, entry 10: consistent.<br>destination sc_lv4wyiopxa7xzpcb7brnjzz7wyrrnokugcvgnad2kisxxdunvyqa, entry 43: consistent.<br>lane sc_kr3xlpxfownbjje5yqcjvfabdevrofkktywe3jdup66db26y3xna, entry 5: consistent.<br>lane sc_2yltqszyakomf67nvl2v3grkjikdppuffpzrbsjkytwywh3gshla, entry 13: consistent.<br>lane sc_5f2xmayjtvt7ryqriepaaai7yiqgjww4o5bu7mt5eapnvy7ihfwq, entry 14: consistent.<br>lane sc_fgstiswxjyeeoc2qgixy6qwh2bg6zi7p65rmael4zb73dd3qqmjq, entry 8: consistent.<br>inbox sc_sktnjn4fmzhhjd636qifmuu3x6rbatrr2u22f2l53rwrri6tquaa, entry 1: consistent.<br>inbox sc_wqg53qjhgo736hjbxf7vgke4qdqtnywwcnvxca3w6h5x2ncxsaaa, entry 1: consistent.<br>inbox sc_4ezgfdvguywh7vjgmfs5izyluzrqyutrp6ybmnqn2ub7ldrvzlkq, entry 1: consistent.<br>All consistent: 12 scopes. | yes |
| 23. The site's front page | exit 0<br>HTTP 200, text/html; charset=utf-8<br>Title: &lt;...> | exit 0<br>HTTP 200, text/html; charset=utf-8<br>Title: 6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra-1 | yes |
| 24. The page published by the edit | exit 0<br>HTTP 200, text/html; charset=utf-8<br>Title: Getting started<br>Shows: "Clone the room, then edit a page." | exit 0<br>HTTP 200, text/html; charset=utf-8<br>Title: Getting started<br>Shows: "Clone the room, then edit a page." | yes |
| 25. The page published after the approval | exit 0<br>HTTP 200, text/html; charset=utf-8<br>Title: Agents<br>Shows: "Ask before you push." | exit 0<br>HTTP 200, text/html; charset=utf-8<br>Title: Agents<br>Shows: "Ask before you push." | yes |
| 26. The room's page | exit 0<br>HTTP 200, text/html; charset=utf-8<br>Title: Artroom page | exit 0<br>HTTP 200, text/html; charset=utf-8<br>Title: Artroom page | yes |
