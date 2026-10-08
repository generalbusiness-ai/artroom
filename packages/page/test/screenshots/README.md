# Screenshots of the page

Written by `node packages/page/test/screens.mjs`, which says how they are made: the page as the scope Worker serves it at
`/page/`, in Chromium, answered with the test Worker's recorded answers in the demo story, after README.md is published and
while AGENTS.md waits for the controller.

| File | Shows | Bytes |
|---|---|---:|
| `issue.png` | Signed in as @una (who joined on the page with an invitation link): the issue she opened through the page, paul's comment, and the acts she may sign on it. | 109532 |
| `change-refused.png` | Signed in as @paul: the change that AGENTS.md is, waiting for the rules extent's approval (policy not met), its one-file version, the merge the destination refused (rules-not-met:rules), and paul's own review refused by the lane, author-cannot-review. | 273367 |
| `change-published.png` | Signed in as @paul: the change that rita's artroom edit README.md made, merged and published, its one-file version with path, size and digest, and the link to the rendered page. | 266874 |
| `rules.png` | Signed in as @paul: the rules of this room, who may change them, and that paul may sign no act that changes them. | 114659 |
| `site-readme.png` | README.md as the site route renders it from the published branch, reached by the change's link. | 18741 |
