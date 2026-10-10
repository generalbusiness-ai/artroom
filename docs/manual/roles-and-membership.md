# Choose a role and manage membership

For a room admin and a person joining that room, this page explains the source CLI invitation path, the actions a role permits, and why a member, a device key and an agent controller are different identities.

**Source guide — cited source `0e5954ecfca23f531cfa2ec42be1524bef3bc9a8` is incorporated in main `a1277d9c43bdaff1873e61f0a3d2444fc5f72b53`. All commands below are UNRUN for this page.** It assumes a supplied, configured source CLI; it supplies no public installation, hosted bootstrap or recovery wizard.

In the admin's existing room context:

```sh
artroom invite @rita --role member --hours 24
```

Pass the printed invitation only to its intended recipient. In the recipient's fresh CLI context:

```sh
artroom join '<original invitation link>'
artroom acts membership
```

The invitation carries a one-time secret, not the member's private signing key. Keep it out of shared notes, screenshots and logs. The CLI makes and privately keeps the device key. Do not paste a private signing key into the invitation or documentation. [Invitation and Join source](https://github.com/generalbusiness-ai/artroom/blob/0e5954ecfca23f531cfa2ec42be1524bef3bc9a8/packages/cli/src/commands.ts#L691)

## Choose actions, not a job label

A roster role names its action list. Builder, planner and reviewer are jobs, not automatic roles. These are relevant default actions; the actual pinned roster and current authority decide:

| Role | Relevant default actions |
|---|---|
| admin | Propose, review and merge; manage membership; publish/activate rules |
| maintainer | Propose, review and merge; triage work |
| member | Propose and review; no merge or membership management |
| agent | Propose and operate work; no default review or merge |
| checker | Submit configured check results; this is not a review verdict |

An offered action can still be refused by its state, guards or current authority. Rules and checks also qualify who may count as an independent reviewer/checker. Changing a role's list is an administrator policy operation affecting that role, not a per-member grant. `invite --acts` is unsupported. [Role lists](https://github.com/generalbusiness-ai/artroom/blob/0e5954ecfca23f531cfa2ec42be1524bef3bc9a8/packages/platform/src/membership.ts#L115), [Role/list changes](https://github.com/generalbusiness-ai/artroom/blob/0e5954ecfca23f531cfa2ec42be1524bef3bc9a8/packages/platform/src/membership.ts#L467)

The person invitation path creates a member of kind person. It does not register a controlled native agent merely because the handle or role is called agent. Native `add-member` has a separate agent/checker path: an agent names an active person controller; a checker names none. `set-role` is limited to active person members and protects the last admin. This guide supplies no shortcut that relabels an agent or borrows a person's key to satisfy independent review. [Registration and role guards](https://github.com/generalbusiness-ai/artroom/blob/0e5954ecfca23f531cfa2ec42be1524bef3bc9a8/packages/platform/src/membership.ts#L430)

## Keep member and key lifetimes separate

A member is a roster identity. Its enrolled keys are the devices or processes allowed to act for it. A new device should use the existing member's actual `invite-key`/`enrol` mechanism; a new person invitation is not same-member recovery. This manuscript does not claim that the person `join` CLI is a complete multi-device enrollment workflow. [Key enrollment declarations](https://github.com/generalbusiness-ai/artroom/blob/0e5954ecfca23f531cfa2ec42be1524bef3bc9a8/packages/platform/src/membership.ts#L375)

Join saves its exact signed request privately before sending. After a lost reply or interrupted wait, use the original link and private record; it reuses the key, signature and deadline. A different link, missing private request/key or already configured unrelated context cannot silently replace the pending Join. Successful exact settlement is distinct from a new enrollment. [Join context guards](https://github.com/generalbusiness-ai/artroom/blob/0e5954ecfca23f531cfa2ec42be1524bef3bc9a8/packages/cli/src/commands.ts#L734)

For an active key item you have identified in the actual membership record, an actor holding `membership.manage` can deliberately retire it through the declared generic act:

```sh
artroom act revoke-key --on membership \
  --target <key-item> --set as=retired
```

Use `compromised` only when that is the intended recorded revocation. It also creates a notice to the directory. This command is a new management act, not a lost-key recovery command; do not guess the item from a handle or a key ID. [Revocation declaration](https://github.com/generalbusiness-ai/artroom/blob/0e5954ecfca23f531cfa2ec42be1524bef3bc9a8/packages/platform/src/membership.ts#L513)

Revoking one key differs from losing the member's last usable key. Removing a member changes its membership state and the authority observations for all its keys, even though the key items are not rewritten. Current rules protect the last admin and its last active key; the declared recovery-key path is the specific exception. A fresh key or readable session cannot stand in for that recovery key. Existing token/read lifetimes and settlement are operation-specific; no universal privilege survives revocation. [Removal and recovery](https://github.com/generalbusiness-ai/artroom/blob/0e5954ecfca23f531cfa2ec42be1524bef3bc9a8/packages/platform/src/membership.ts#L497)

## If enrollment or management is refused

- **Wrong, used or expired invitation:** preserve the original pending request and ask the actual admin to inspect the invitation.
- **Handle already in use:** do not create a lookalike identity to replace the old member or its history.
- **Key already used or a recovery key:** use the proper explicit enrollment path; invitation authority does not override those guards.
- **No management action or last-admin guard:** use the qualified admin/recovery owner; do not remove the protection by editing local config.
- **Member removed or no active key:** resolve its recorded lifetime and recovery path before asking for new authority.
- **Reply unavailable:** keep the exact original where its workflow supports that; generic management acts do not gain a durable retry journal from this page.

This is source prose for manual outcome 21. Initial source publication receipt `732ca210b84469513b3a53b618b2867ca92a71e0` does not approve this new guide. It proves no credential operation, hosted enrollment, physical device continuity, complete agent setup or cold-reader result. Its sample CI, style and exact page review remain owed. Full manual and I5/I6 authority/device acceptance remain separate.
