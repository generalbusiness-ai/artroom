# The lending library: demo script

A script for recording the lending library. The story is Nasruddin and the
pot. It takes two people, or one person with two browser profiles.

**Run status: the story's seven acts, the refused cancel and `dap verify`
ran in a rehearsal room on 14 October 2026, without publication; the
[runbook's rehearsal section](runbook.md#the-rehearsal-run-14-october-2026)
records what was seen.** The rehearsal room does not publish. Publication
is built (main `5e11ca03`) and runs in the final room, which is not yet
provisioned; until then, the published shelf, shot 10 and the shelf
parts of shots 1, 8b and 9 are unrun. In the rehearsal room, show a
lending act's acceptance on its own and label its page unpublished. Do
not make browser page edits to simulate automatic publication.

## The point

The record holds what each person did, in order, and the rules decide
what can be done. A person's account of why is kept as their own signed
words, in a description or a reason. The library judges none of it: the
birth and the death are recorded the same way.

## Before recording

- A room is provisioned as [the runbook](runbook.md) says, with the library
  established and empty.
- The neighbour has joined as the room's founder. The neighbour is staff.
- Nasruddin has joined as a member, with an invitation that the
  neighbour issued with `dap invite --keep`.
- Each has the member interface open. A third window shows the published
  shelf.
- At least five minutes have passed since the roles were granted.

## The shots

| Shot | Who | Does | The interface shows | Say |
|---|---|---|---|---|
| 1 | Neighbour | Donates "Big pot", description "A heavy copper pot. Holds eight litres." | The pot, available. Its shelf page is published. | "The library starts empty. Anyone can donate." |
| 2 | Nasruddin | Borrows the big pot. | Lent to @nasruddin. | "Nasruddin borrows the pot." |
| 3 | Nasruddin | Returns the big pot. | Available again. | "And brings it back." |
| 4 | Nasruddin | Speaks the line below. Looks for a small pot to return. | The list has one thing. There is no small pot to choose, so there is nothing to sign. | The line below. Then: "The library has never held a small pot. He cannot return what was never lent." |
| 5 | Nasruddin | Donates "Small pot", description "Baby born when the big pot was with me". | The small pot, available, donated by @nasruddin, with his description. | "So he donates it. The description is his. The library keeps his words and judges none of them." |
| 6 | Nasruddin | Borrows the big pot again. | Lent to @nasruddin. | "He borrows the big pot again." |
| 7 | Nasruddin | Says the pot died. Does nothing in the interface. | No change. | "This time he comes back empty-handed. The pot, he says, has died." |
| 8a | Nasruddin | Cancels the big pot, reason "The pot died". The member interface offers **Cancel this thing** to members too. | "Only staff can cancel a thing. (unauthorized)" The pot is still lent. | "He cannot strike it from the library himself. Only staff can." |
| 8b | Neighbour | Cancels the big pot, reason "Nasruddin says the pot died". | The pot is gone. The reason is on its page and in the record, under the neighbour's name. | "The neighbour records it, in the neighbour's own words." |
| 9 | Neighbour | Donates "New big pot", description "Copper, eight litres." | Two things on the shelf: the small pot and the new big pot. The old pot's page stays, marked gone. | "And the shelf is replenished." |

Nasruddin's line at shot 4, spoken and not written to any record (a
traditional telling):

> "Oh," responded the Hodja. "While it was in my care your cauldron gave
> birth to a little one. Because you are the owner of the mother
> cauldron, it is only right that you should keep its baby. And in any
> event, it would not be right to separate the child from its mother at
> such a young age."

## A second refusal, to show beside the story

After shot 2, in a third profile or as the neighbour: try to borrow the
big pot while Nasruddin has it. If the list is current, the interface
offers no borrow for a lent thing. If the list is a moment old, the
library refuses: "Someone changed that thing first. Look again, then
decide. (revision-moved)". Either way the pot has one borrower.

## Closing shots

| Shot | Show | Say |
|---|---|---|
| 10 | The published shelf: three pages. The old big pot reads "gone: Nasruddin says the pot died". Each page names the lending scope it came from, and the commit history shows each page's changes. | "The shelf is a published copy of the library's record. Each change to a page is a commit, and the library's record says which act made it." |
| 11 | The record, in the interface or with `dap log`: seven acts in order, each with its signer. The refused cancel is not among them. | "The record is the authority. Seven acts took effect. The one that was refused changed nothing." |
| 12 | `dap verify` on the lending scope. | "And anyone with the record can check it again." |

## What is in the record at the end

The lending scope's journal, after its genesis and the confirmation of
its creation:

1. `donate` Big pot, by the neighbour
2. `borrow`, by Nasruddin
3. `return`, by Nasruddin
4. `donate` Small pot, by Nasruddin
5. `borrow`, by Nasruddin
6. `cancel`, reason "Nasruddin says the pot died", by the neighbour
7. `donate` New big pot, by the neighbour

## Record the actual run

Keep actual control labels, recorded facts, refusal reasons, item numbers,
and publication receipts with each shot. If a current list offers no borrow for a lent thing, show the retained native refusal beside it. Do not fabricate
an interactive control or substitute a local refusal for a scope judgment.

Record interrupted donation and invitation recovery as separate acceptance
witnesses. The participant reuses the original kept request after a reload.
Do not let that witness add an extra donation to the seven-act story.

For the public closing shot, use an unseated browser. It must read all three
shelf pages and commit history. Show the cancelled page's reason and the
lending scope it names. Match its commit to the `cancel` entry in the
member's lending journal through the destination's receipt, which names the
sending entry. The journal remains
for members; its private session is never part of a public link.
Publication and this public-history witness have not run yet.
