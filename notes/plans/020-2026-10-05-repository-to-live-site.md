# Plan 020: repository to live site, through the lane

Date: 2026-10-05. Hugh's direction, recorded by the planner. A small demo
slice that shows a developer going from a repository to a live site with
nothing but the GitHub-familiar surface, each step a recorded act. It is
the destination scope's first effect class and is scheduled as the first
package after I3 lands, ahead of staged rollout, which comes later for
larger applications. Standard Workers hostnames are enough for the demo;
custom domains are not part of it.

## The five steps

1. **Connect.** A person founds a repository's directory on the familiar
   surface and names one destination: a site. The founding records the
   account the destination deploys into.
2. **Preview per lane.** Opening a pull request creates a preview. The
   destination scope runs the build as a sandboxed job (the same sandbox
   the checkers use), uploads the assets, and deploys a version under a
   per-lane hostname on the standard Workers domain. The preview URL is a
   fact of the lane, shown on the pull request with the `artroom://` URI of
   the deploy entry beside it.
3. **Production on merge.** The merge lands, and the destination's effect
   promotes that exact version to the production hostname. The effect
   entry records the destination, the version and its recovery custody, as
   the authority note requires of an effect with an outside destination.
4. **Rollback as an act.** Roll back is a signed act that points
   production at a prior recorded version. The history shows who, when and
   from which version. It is immediate because versions are immutable and
   already deployed.
5. **The record.** The replay of the lane shows the issue, the review, the
   agent's grant if an agent took part, the rule that admitted the merge,
   and the deploy, in one history.

## Comments on the preview page (second priority)

Hugh's addition of 2026-10-05, 15:39 Eastern: a reviewer looks at the
preview and comments on it where they see the problem, not in a separate
place. A comment on the page is a lane comment with an anchor: the
preview's version, the page path, and a selector for the element, with an
optional screenshot. It appears on the pull request as any other comment,
threads resolve the same way, and because it is a fact of the lane it
survives the next preview version and names the version it was made on.
This fits the model without a new object: the lane forms already have a
thread item anchored to a path and a line of a diff; the page anchor is a
second kind of anchor on the same item. It is second priority: the five
steps come first, and this follows in the same package if time allows.

## What it needs

| Need | Where it is decided |
|---|---|
| The destination definition's first effect class: static assets and an optional Worker, deployed as one version per lane, promoted on merge, rolled back by act | The authority note's successor (plan 019 names it) |
| A build job: package install and a build command in the checker sandbox, with time and size bounds, producing the assets the deploy uploads | The task kind of I3's platform definitions and the capacity design |
| Per-lane and production hostnames on the standard Workers domain, with a version per deploy | The destination's effect class; installation duty for namespaces |
| The deploy entry's `artroom://` URI shown on the pull request | Contract revision 18 (adopted) and the lane forms successor |
| Acceptance story: the five steps on the demo repository, with the agent refusal and the extents story of plans 016 and 019 beside them | The proof plan's successors |
| A dependency cache keyed by the lockfile digest, and no build when a version's inputs are unchanged (the deploy entry already names the version) | The build job definition and the destination's effect class |
| Previews readable only by members, through the membership scope's grants, not a password | The authority note's successor; the destination's effect class |
| Per-environment variables and secrets held by the destination under declared names, never in the repository | The authority note's successor (destination definition) |
| A page anchor (version, path, selector, optional screenshot) on the lane forms' thread item, so a comment made on the preview page is a lane comment | The lane forms successor (`fdc3d7e2`) |

## What it is not

- Not staged or canary rollout; that is a later package for larger
  applications and is not needed for the demo.
- Not custom domains or certificates.
- Not framework detection: the demo repository declares its build command.
- Not a build system of its own: the build runs a declared command in the
  existing sandbox.
