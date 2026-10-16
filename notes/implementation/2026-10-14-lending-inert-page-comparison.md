# Read published shelf text without applying its styles

Request `bfb6ed30`, promise `f18f9e19`.

The Library compares a thing's current shelf text with its published Site
page. A Site page includes an inline stylesheet. Parsing that full page
with `DOMParser` triggered the Library's `style-src 'self'` policy. Console
diagnostic 89361 recorded three identical violations; their stylesheet
hash matches the Site renderer's 947-byte stylesheet.

The reader now parses the response into a detached template and reads
`template.content`. The parsed styles, scripts and embedded resources stay
inert. The Library keeps its strict CSP. The comparison still uses the
rendered text, direct-child shape and observed commit, and returns the
immutable link for that commit. Its existing response, content-type,
post-response text-length and unreadable-result checks remain in place.

## Local validation

The checks ran at `0e46cacf`, after composing the actual CLI landing.

- The Chromium witness uses the actual reader, Site renderer and shelf
  functions, with the Site wrapper's copied function body and scripted
  frame, commit and HTTP answers. The old reader reproduces the exact
  stylesheet CSP violation. All 15 corrected-reader cases pass, covering
  literal text and entities, the three shelf states, match/difference,
  shape and commit checks, and unreadable responses. The eight positive
  cases have no console errors; corrected cases have no CSP violations
  or page errors. Parsed style, script, image, link, import and iframe
  canaries cause no resource request or script execution.
- Both Lending TypeScript configurations and the existing renderer-text
  test pass. The required pool compatibility check is a verified no-op.
- The normal Lending asset producer ran once. Only the generated
  `browser-build/lending.js` and the Worker's embedded Lending module
  changed. Disk and embedded asset bytes agree. Lending HTML and CSS
  retain their prior bytes. This is generation provenance and byte
  correspondence, not an independent proof of minifier semantics.

The sealed public proof index accompanies the normal review record. That
record identifies the exact gate head and outcome separately.

## Hosted follow-up

This local witness establishes the parser boundary, with no Native acts,
deployed Worker or retained browser identity. Verification of the corrected
hosted build belongs to the deployment follow-up. Earlier failed hosted
observations, including 9610, 22144 and 89361, retain their original
outcomes. The identified stylesheet cause is grounded in 89361; it does not
establish a sole cause for the earlier aggregate failures.
