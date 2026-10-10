# Review an exact change version

For a reviewer using an already configured Artroom source CLI, this page helps you record a judgment about the exact content you read and the repository requirement it satisfies.

**Source guide — cited source `0e5954ecfca23f531cfa2ec42be1524bef3bc9a8` is incorporated in main `a1277d9c43bdaff1873e61f0a3d2444fc5f72b53`. All commands below are UNRUN for this page.** No public package installation or completed browser review is established here. Use only a CLI already supplied for that source and a room whose actual declaration supports these acts.

First read the change and the actual entries that hold its content:

```sh
artroom acts <change-scope>
artroom log <change-scope>
artroom show <change-scope>:<manifest-entry>
artroom show <change-scope>:<source-entry>
```

Replace placeholders with recorded identities. A manifest is a recorded version of the proposed change. A manifest list names its frozen source entries and digests; read every relevant source entry. Reading only a title, a task transcript or the latest published page is not reviewing that version. General immutable diff/interdiff access and cold-review acceptance remain separate work.

## Record one verdict for one requirement

An extent is a named part of the repository with its own reviews and checks. Read the room's actual rules and touched paths before choosing one. The default source requirement uses `change.review`; infrastructure uses `change.merge`; authority files such as `AGENTS.md` use `rules.publish`. A repository may add patterns and requirements. [Extent definitions](https://github.com/generalbusiness-ai/artroom/blob/0e5954ecfca23f531cfa2ec42be1524bef3bc9a8/packages/platform/src/extents.ts#L48)

For an extent actually named `source`, an eligible independent reviewer can record:

```sh
artroom act review-verdict --on <change-scope> \
  --set manifest=<manifest-item> --set verdict=approve --set extent=source
```

Use `request-changes` instead of `approve` to record that judgment. It is not an approval and does not supply a universal veto independent of the room's rules. A comment or a passed machine check is not a review verdict.

The current declaration needs `change.review` to record the act. The destination also checks the action required by the named extent when deciding whether an approval counts. A wrong or omitted extent counts for no extent. Mixed changes need the union of their touched requirements; one verdict names one extent. [Verdict declaration](https://github.com/generalbusiness-ai/artroom/blob/0e5954ecfca23f531cfa2ec42be1524bef3bc9a8/packages/lanes/src/change.ts#L907), [Native counting](https://github.com/generalbusiness-ai/artroom/blob/0e5954ecfca23f531cfa2ec42be1524bef3bc9a8/packages/platform/src/extents.ts#L429)

## Keep the subject and reviewer independent

The manifest must still be current when the verdict is admitted. The lane refuses an author reviewing their own manifest. The destination judges the current reviewer and controller relationship as well as the required action. By default an authoring agent's controller is not independent of that author. An explicitly permitted content policy may allow that controller's review; the author remains excluded, and the `rules` extent keeps its stricter requirement.

A declared single-controller exception is a separate merge rule. It applies only when the actual observed rules, controller count and author/controller relationship meet all its conditions. It does not turn an author's verdict into independent review or remove checks. Missing relationship/count evidence cannot justify assuming the exception. [Independence and exception](https://github.com/generalbusiness-ai/artroom/blob/0e5954ecfca23f531cfa2ec42be1524bef3bc9a8/packages/platform/src/extents.ts#L436)

A job label such as reviewer grants no authority. The default native `agent` role cannot review or merge. Use the independently authorized member and actual role/policy setup, with its own key; never borrow someone else's identity to make the judgment count.

## Change your judgment deliberately

This declaration allows one submitted verdict per reviewer for a manifest. To replace your own submitted verdict for that same manifest, supply its exact review item:

```sh
artroom act review-verdict --on <change-scope> \
  --set manifest=<same-manifest-item> --set earlier=<your-review-item> \
  --set verdict=request-changes --set extent=source
```

The replacement supersedes the earlier review. It does not preserve both extent approvals. Do not expect one reviewer to fill several required extents by making duplicate submissions; plan the qualified reviewers or an explicitly adopted policy. A review of another manifest cannot be silently replaced through this field. No approval carries automatically to a new version merely because its title is the same. The current `review-verdict` declaration has no `scope`, `dependsOn` or `carry` field. Earlier workroom vocabulary is not an extra argument to this act; use its actual declared subjects and retain older review evidence at its original version. [Duplicate and replacement guards](https://github.com/generalbusiness-ai/artroom/blob/0e5954ecfca23f531cfa2ec42be1524bef3bc9a8/packages/lanes/src/change.ts#L926)

An anchored question can name the exact manifest, path, optional line and side through the declared `open-thread` act. Its reference stays with that version; a later version needs deliberate reading and judgment. This manuscript supplies no browser annotation or rendered-diff proof. [Thread declaration](https://github.com/generalbusiness-ai/artroom/blob/0e5954ecfca23f531cfa2ec42be1524bef3bc9a8/packages/lanes/src/change.ts#L1139)

## If the review cannot proceed

- **Author or authority refusal:** use a genuinely qualified independent reviewer; do not change the stated author or reuse another key.
- **Version no longer current:** preserve the old subject, read the new version and decide deliberately.
- **Verdict already exists:** inspect your recorded review and use its exact `earlier` reference if replacement is intended.
- **Merge in progress:** inspect that operation before creating another review or mutation.
- **Content unavailable or incomplete:** stop the review; absence of readable evidence is not approval.
- **Reply lost or unavailable:** inspect the original records. Generic `act` may sign a fresh request if rerun; exact recovery requires the retained original envelope and its owning mechanism.

This is source prose for manual outcome 16. Initial source publication is recorded by receipt `732ca210b84469513b3a53b618b2867ca92a71e0`; that receipt does not approve this new guide. All samples, style checks, independent page approval, public release and real browser/cold-review evidence remain owed. It does not complete the full manual or its unfamiliar-application acceptance.
