# Local room label browser evidence

The production Page ran against actor-bound native readonly answers for an existing room. The browser settings contain the explicit local-label fixture `Field notebook`, bound to that room's exact directory, membership reference and configured register. No claim completion is invented and no founding or native name mutation is submitted.

At 320 CSS pixels in both light and dark schemes, one visible room switch shows the local label above the actual recorded repository name. Its target is 50px high; editable text is 16px and there is no horizontal overflow. Changing only the label's membership incarnation makes the Page ignore the stale label on reload, while its actual configured room and native name remain unchanged.

Recorded from 2026-10-09 03:01:37 to 03:01:51 UTC at source `54b71c69e91b143e22c90fa90c5b06f561c1565b`, tree `1138b362b0d3d204b40a42ff93eabc4c1d9c4f4e`; command exit 0. The authorized `a1c2d3f6` source and observed source share built Page assets blob `7e6eda7840f30a0d8f0bbde3eda755ebebe92eb1`; their difference is this recorder mode and its native recorded-name projection.

Environment: cached Playwright 1.63.0 and Chromium 153.0.8010.12 on macOS, at `https://scopes.test/page/`. Browser plugin not available. The recorder's Git host and scheduler remain labelled stand-ins. No browser errors or unrecorded requests occurred. `label-checks.json` contains only public observations, with no private signing material or direct native response payloads.

```
PLAYWRIGHT_CORE=<cached Playwright 1.63.0 directory> \
CHROMIUM='<cached Chromium 1243 executable>' \
node --import tsx --no-warnings scripts/demo-captures.ts \
  --recorded --label-witness --out /tmp/artroom-page-v2-label-browser
```

| File | Shows | Bytes |
|---|---|---:|
| `local-label-light-320.png` | One local label and the actual recorded name in the narrow light room switch. | 24257 |
| `local-label-dark-320.png` | The same native room and local label in the narrow dark room switch. | 24367 |

This focused follow-up covers the late local-label change. It does not regenerate the earlier Page or demo captures, or extend the prior gate to a new whole-source gate. Persistence after actual native claim completion is covered at the native adapter and Page test boundaries separately.

Raw command log: `/tmp/artroom-page-v2-label-browser-first.log`, SHA-256 `5d86754bc5917fabb3ea39ea4abe0231f1ba2ec8e180e7508b87ae45ae1af9d1`.
