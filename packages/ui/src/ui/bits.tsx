/** Small shared pieces. Every status pairs colour with words. */

import type { ComponentChildren } from "preact";
import type { ActId, LandOp, MemberId, Refusal, Timestamp } from "../room/contract.ts";
import { useApp } from "./context.ts";
import { clock, relative, short } from "./format.ts";
import { Icon, type IconName } from "./icons.tsx";

export type Tone = "ok" | "warn" | "bad" | "accent" | "carried" | "outline" | "neutral";

export function Badge({ tone = "neutral", icon, children }: { tone?: Tone; icon?: IconName; children: ComponentChildren }) {
  return (
    <span class={`badge ${tone === "neutral" ? "" : tone}`}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}

export function Actor({ handle, plain }: { handle: MemberId | null | undefined; plain?: boolean }) {
  const { snap } = useApp();
  if (!handle) return <span class="actor muted">the room</span>;
  const p = snap.people.find((x) => x.handle === handle);
  const kind = p?.kind ?? "person";
  return (
    <span class="actor" title={p ? `${p.name}, ${p.role}` : handle}>
      {!plain && (
        <span class={`avatar ${kind}`} aria-hidden="true">
          {handle.charAt(1).toUpperCase()}
        </span>
      )}
      {handle}
      {kind !== "person" && <span class="kind-tag">{kind}</span>}
    </span>
  );
}

export function Sha({ sha, label }: { sha: string | null | undefined; label?: string }) {
  if (!sha) return <span class="sha">unknown</span>;
  return (
    <code class="sha" title={sha} aria-label={`${label ?? "commit"} ${short(sha)}`}>
      {short(sha)}
    </code>
  );
}

export function When({ at }: { at: Timestamp }) {
  const { snap } = useApp();
  return (
    <time dateTime={at} title={at} class="nowrap">
      {clock(at)} · {relative(at, snap.now)}
    </time>
  );
}

export function Glob({ glob, hit }: { glob: string; hit?: boolean }) {
  return <code class={`glob${hit ? " hit" : ""}`}>{glob}</code>;
}

/** Every refusal shows its rule, its reason and its fix. */
export function RefusalNotice({ refusal, title }: { refusal: Refusal; title?: string }) {
  const { why } = useApp();
  return (
    <div class="notice bad" role="alert">
      <div class="notice-title">
        <Icon name="refused" />
        {title ?? "Refused"}
      </div>
      <dl class="kv">
        <dt>Rule</dt>
        <dd>
          <code>{refusal.rule}</code>
        </dd>
        <dt>Reason</dt>
        <dd>{refusal.reason}</dd>
        <dt>Fix</dt>
        <dd>{refusal.fix ?? "No fix is recorded for this rule."}</dd>
      </dl>
      {refusal.act && (
        <div>
          <button class="btn quiet small" type="button" onClick={() => why(refusal.act!)}>
            <Icon name="why" /> Why, in full
          </button>
        </div>
      )}
    </div>
  );
}

export function WhyLink({ act, children }: { act: ActId; children?: ComponentChildren }) {
  const { why } = useApp();
  return (
    <button class="btn quiet small" type="button" onClick={() => why(act)} aria-label={typeof children === "string" ? children : "Why"}>
      <Icon name="why" />
      {children ?? "Why"}
    </button>
  );
}

export function Empty({ icon = "check", title, children }: { icon?: IconName; title: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <Icon name={icon} size={28} />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

/** A landing operation's state, as one badge. */
export function LandBadge({ op }: { op: LandOp }) {
  switch (op.state) {
    case "accepted":
      return <Badge>Accepted</Badge>;
    case "preparing":
      return <Badge tone="accent">{op.attempts > 1 ? `Preparing again (attempt ${op.attempts})` : "Preparing"}</Badge>;
    case "ready":
      return <Badge tone="accent">Ready</Badge>;
    case "publishing":
      return <Badge tone="accent" icon="upload">Publishing</Badge>;
    case "unresolved":
      return op.abort ? (
        <Badge tone="bad" icon="alert">Abort attempt</Badge>
      ) : op.readBack.main === "unexpected" ? (
        <Badge tone="bad" icon="alert">Another writer on main</Badge>
      ) : (
        <Badge tone="warn" icon="cloudOff">Unresolved</Badge>
      );
    case "landed":
      return op.abort ? <Badge tone="warn" icon="alert">Landed despite abort</Badge> : <Badge tone="ok" icon="check">Landed</Badge>;
    case "aborted":
      return <Badge tone="bad">Aborted</Badge>;
    case "retryable":
      return <Badge tone="warn">Needs a new land</Badge>;
    case "failed":
      return <Badge tone="bad">Failed</Badge>;
  }
}
