/** Screen 1: the viewer's attention queue. Each item says what to do, why it is theirs, and offers one action. */

import type { ComponentChildren } from "preact";
import type { RoomSnapshot } from "../room/adapter.ts";
import type { AttentionItem } from "../room/contract.ts";
import { Actor, Empty } from "../ui/bits.tsx";
import { useApp } from "../ui/context.ts";
import { clock, join, laneGoal, plural, proposalOf, relative } from "../ui/format.ts";
import { Icon, type IconName } from "../ui/icons.tsx";
import { landingFacts } from "../ui/landing.tsx";
import { href } from "../ui/router.ts";

interface Explained {
  icon: IconName;
  tone: "" | "warn" | "bad";
  why: ComponentChildren;
  detail?: ComponentChildren;
  action: { label: string; href: string };
}

/** Turn one attention item into its reason and its single action. */
export function explainItem(snap: RoomSnapshot, item: AttentionItem): Explained {
  const me = snap.viewer;
  const myTeams = snap.people.find((p) => p.handle === me)?.teams ?? [];
  switch (item.why) {
    case "review-requested": {
      const p = proposalOf(snap, item.proposal.lane, item.proposal.generation);
      const o = p?.obligations.find((x) => x.id === item.obligation);
      const via = myTeams.includes(item.as as never) ? (
        <>
          You are in <strong>{item.as}</strong>, and rule <strong>{o?.rule ?? item.obligation}</strong> needs a review from {item.as} for {join(o?.paths ?? [])}.
        </>
      ) : (
        <>Rule {o?.rule ?? item.obligation} names you as a reviewer.</>
      );
      return { icon: "eye", tone: "", why: via, action: { label: `Review generation ${item.proposal.generation}`, href: href.proposal(item.proposal.lane, item.proposal.generation, "review") } };
    }
    case "evidence-invalidated": {
      const p = proposalOf(snap, item.proposal.lane, item.proposal.generation);
      const mine = p?.notCarried.find((n) => snap.reviews.find((r) => r.id === n.act)?.by.member === me);
      return {
        icon: "refresh",
        tone: "warn",
        why: <>You approved generation {item.proposal.generation - 1}. A verdict carries forward only while what it covered is unchanged.</>,
        detail: mine ? <>Not carried: {mine.text}</> : undefined,
        action: { label: `Review generation ${item.proposal.generation}`, href: href.proposal(item.proposal.lane, item.proposal.generation, "review") },
      };
    }
    case "check-requested":
      return { icon: "eye", tone: "", why: <>You run this check, and policy requires it.</>, action: { label: "Open the proposal", href: href.proposal(item.proposal.lane, item.proposal.generation) } };
    case "objection":
      return { icon: "alert", tone: "bad", why: <>You hold this lane, and a reviewer objected.</>, action: { label: "Read the objection", href: href.proposal(item.proposal.lane, item.proposal.generation) } };
    case "note": {
      const n = snap.notes.find((x) => x.id === item.note);
      const parent = item.replyTo ? snap.notes.find((x) => x.id === item.replyTo) : undefined;
      const anchor = n && "lane" in n.anchor ? n.anchor : null;
      return {
        icon: "message",
        tone: "",
        why: <>You wrote the note it answers{parent ? <> at {clock(parent.at)}</> : null}.</>,
        detail: n ? <>“{n.text}”</> : undefined,
        action: { label: "Read the thread", href: anchor ? href.proposal(anchor.lane, anchor.generation) : href.room() },
      };
    }
    case "land-outcome":
      return { icon: "check", tone: "", why: <>You asked for this landing.</>, action: { label: "See the landing", href: href.room() } };
    case "recut-needed":
      return item.unheld
        ? {
            icon: "merge",
            tone: "warn",
            why: <>Nobody holds this lane, so it is in every member's queue. A person or an agent can take it over.</>,
            action: { label: "See the lane", href: href.proposal(item.lane) },
          }
        : { icon: "merge", tone: "warn", why: <>You hold this lane, so the recut is yours.</>, action: { label: "Open the lane", href: href.proposal(item.lane) } };
    case "lease-expiring":
      return { icon: "clock", tone: "warn", why: <>You hold this lane.</>, action: { label: "Open the lane", href: href.proposal(item.lane) } };
    case "lane-unheld": {
      const lane = snap.lanes.find((l) => l.lane === item.lane);
      return {
        icon: "unlock",
        tone: "warn",
        why: <>The holder's lease {item.reason === "expired" ? "expired with no handover note" : "was released"}. Any member may take the lane over.</>,
        detail: lane ? <>Generation {lane.generation} is kept: the claim, each head, the notes and the verdicts.</> : undefined,
        action: { label: "See the lane", href: href.room() },
      };
    }
    case "publication-unresolved": {
      const op = snap.landOps.find((o) => o.id === item.op);
      const waiting = snap.landOps.filter((o) => o.state === "ready" || o.state === "preparing");
      return {
        icon: "cloudOff",
        tone: "warn",
        why: <>You are an admin. Unresolved publications go to admins.</>,
        detail: (
          <>
            {op ? landingFacts(snap, op).summary : "The landing's current state was not loaded."}
            {waiting.length ? <> Waiting behind it: {join(waiting.map((o) => `“${laneGoal(snap, o.lane)}”`))}.</> : null}
          </>
        ),
        action: { label: "See the landing queue", href: href.room() },
      };
    }
    case "revert-lane":
      return { icon: "refresh", tone: "bad", why: <>The room opened a revert lane.</>, action: { label: "See the lane", href: href.proposal(item.lane) } };
    case "policy": {
      const rule = snap.policy.document?.rules.find((r) => r.id === item.rule);
      return {
        icon: "bell",
        tone: "",
        why: <>{rule && rule.kind === "notify" ? rule.why : `Rule ${item.rule} notified you.`}</>,
        action: { label: "Read the proposal", href: item.lane ? href.proposal(item.lane) : href.room() },
      };
    }
  }
}

function Item({ item, done }: { item: AttentionItem; done?: boolean }) {
  const { snap } = useApp();
  const x = explainItem(snap, item);
  const gen = "proposal" in item ? item.proposal.generation : undefined;
  const entry = snap.feed.find((f) => f.seq === item.seq);
  return (
    <li class={`card item${done ? " done" : ""}`} data-why={item.why}>
      <div class={`item-icon ${done ? "" : x.tone}`} aria-hidden="true">
        <Icon name={done ? "check" : x.icon} size={18} />
      </div>
      <div class="stack-sm">
        <p class="item-title">{item.text}</p>
        {!done && <p class="item-why">{x.why}</p>}
        {!done && x.detail && <p class="item-detail">{x.detail}</p>}
        <p class="small subtle">
          {[item.lane ? laneGoal(snap, item.lane) : null, gen !== undefined ? `generation ${gen}` : null, entry ? `${clock(entry.at)}, ${relative(entry.at, snap.now)}` : null, done ? "done" : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {!done && (
        <div class="item-action">
          <a class="btn primary" href={x.action.href} data-nav="item">
            {x.action.label}
            <Icon name="chevron" />
          </a>
        </div>
      )}
    </li>
  );
}

export function NeedsYou() {
  const { snap } = useApp();
  const open = snap.attention.filter((a) => a.open).slice().reverse();
  const done = snap.attention.filter((a) => !a.open).slice().reverse();
  return (
    <>
      <header class="page-head">
        <h1>Needs you</h1>
        <p>
          {!snap.coverage.attention ? (
            <>
              Showing {plural(open.length, "open item")} for <Actor handle={snap.viewer} plain />. The room has more than this connection loaded, so this list is not complete.
            </>
          ) : open.length ? (
            <>
              {plural(open.length, "thing")} {open.length === 1 ? "is" : "are"} waiting for <Actor handle={snap.viewer} plain />. Each one says why it is yours and what to do.
            </>
          ) : (
            <>Nothing is waiting for <Actor handle={snap.viewer} plain />.</>
          )}
        </p>
      </header>
      {open.length ? (
        <ol class="queue" aria-label="Waiting for you">
          {open.map((a) => (
            <Item key={a.id} item={a} />
          ))}
        </ol>
      ) : snap.coverage.attention ? (
        <div class="card">
          <Empty title="Nothing needs you right now">When something does, it will say why it is yours.</Empty>
        </div>
      ) : (
        <div class="card pad muted">No open items were loaded. The queue was not read completely, so there may be some.</div>
      )}
      {done.length > 0 && (
        <details class="section">
          <summary class="disclosure">
            <Icon name="chevron" class="chev" />
            Done ({done.length})
          </summary>
          <ol class="queue" style={{ marginTop: "10px" }} aria-label="Done">
            {done.map((a) => (
              <Item key={a.id} item={a} done />
            ))}
          </ol>
        </details>
      )}
      <p class="small subtle section">
        Every member has one queue. Agents read theirs over MCP; people read theirs here. Each item comes from the platform or from a rule on the <a href={href.policy()}>Policy</a> page.
      </p>
    </>
  );
}
