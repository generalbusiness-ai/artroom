/**
 * Screen 4: the repository's policy. The rules in plain English, recent
 * outcomes, and a dry run of a draft rule against the room's history.
 */

import { Fragment } from "preact";
import { useState } from "preact/hooks";
import type { DraftRule, DryRunResult, PolicyOutcome } from "../room/adapter.ts";
import type { Refusal, Role, Rule } from "../room/contract.ts";
import { isRefusal } from "../room/contract.ts";
import { Badge, Glob, RefusalNotice, type Tone, When } from "../ui/bits.tsx";
import { useApp } from "../ui/context.ts";
import { join, laneGoal, plural } from "../ui/format.ts";
import { Icon } from "../ui/icons.tsx";
import { href } from "../ui/router.ts";

const KIND: Record<Rule["kind"], { label: string; when: string; tone: Tone }> = {
  refuse: { label: "Refuse", when: "Checked when an act arrives, before it is recorded", tone: "bad" },
  require: { label: "Require", when: "Checked on every new generation", tone: "accent" },
  carry: { label: "Carry", when: "Checked when an earlier verdict could count for a new generation", tone: "carried" },
  land: { label: "Land", when: "Checked on land, and again at reservation", tone: "warn" },
  notify: { label: "Notify", when: "Run after the act is recorded", tone: "outline" },
};

function RuleCard({ rule }: { rule: Rule }) {
  const k = KIND[rule.kind];
  return (
    <li class="card rule" data-rule={rule.id}>
      <div class="rule-head">
        <Badge tone={k.tone}>{k.label}</Badge>
        <span class="rule-id">{rule.id}</span>
        <span class="small subtle">{k.when}</span>
      </div>
      {rule.description && <p>{rule.description}</p>}
      <div class="rule-body">
        {rule.kind === "require" && (
          <p>
            When a change touches {rule.paths.map((g) => <Glob key={g} glob={g} />)}, it needs{" "}
            {rule.obligation.type === "review" ? (
              <strong>
                {rule.obligation.count === 1 ? "an approval" : `${rule.obligation.count} approvals`} from {join(rule.obligation.from as string[])}
              </strong>
            ) : (
              <strong>
                the {rule.obligation.check} check from {join(rule.obligation.by as string[])}
              </strong>
            )}
            .
          </p>
        )}
        {rule.kind === "refuse" && (
          <dl class="kv">
            <dt>On</dt>
            <dd>{rule.on.join(", ")}</dd>
            <dt>Reason</dt>
            <dd>{rule.reason}</dd>
            <dt>Fix</dt>
            <dd>{rule.fix}</dd>
          </dl>
        )}
        {rule.kind === "land" && (
          <dl class="kv">
            <dt>Reason</dt>
            <dd>{rule.reason}</dd>
            <dt>Fix</dt>
            <dd>{rule.fix}</dd>
          </dl>
        )}
        {rule.kind === "notify" && (
          <p>
            On {rule.on.join(", ")}, tells <strong>{join(rule.to as string[])}</strong>. Their queue shows: “{rule.why}”
          </p>
        )}
      </div>
      {"refuse" in rule || "when" in rule || "allow" in rule || "block" in rule ? (
        <details>
          <summary class="disclosure">
            <Icon name="chevron" class="chev" />
            Expression
          </summary>
          <pre class="expr" style={{ marginTop: "6px" }}>
            {"refuse" in rule ? rule.refuse : "block" in rule ? rule.block : "allow" in rule ? rule.allow : "when" in rule ? rule.when : ""}
          </pre>
        </details>
      ) : null}
    </li>
  );
}

const OUTCOME: Record<string, { label: string; tone: Tone }> = {
  refuse: { label: "Refused", tone: "bad" },
  block: { label: "Blocked", tone: "bad" },
  obligation: { label: "Obligation", tone: "accent" },
  carry: { label: "Carried", tone: "carried" },
  "no-carry": { label: "Not carried", tone: "warn" },
  notify: { label: "Notified", tone: "outline" },
  error: { label: "Error", tone: "bad" },
  pass: { label: "Passed", tone: "ok" },
};

function OutcomeRow({ o }: { o: PolicyOutcome }) {
  const { snap } = useApp();
  const x = OUTCOME[o.decision.outcome.result] ?? { label: o.decision.outcome.result, tone: "neutral" as Tone };
  return (
    <li class="outcome" data-outcome={o.decision.outcome.result}>
      <span class="feed-seq">{o.seq}</span>
      <div class="stack-sm">
        <p class="row">
          <Badge tone={x.tone}>{x.label}</Badge>
          <code class="small">{o.decision.rule}</code>
        </p>
        <p>{o.text}</p>
        <p class="feed-meta">
          <When at={o.at} />
          {o.lane && <a href={href.proposal(o.lane)}>{laneGoal(snap, o.lane)}</a>}
        </p>
      </div>
    </li>
  );
}

// ------------------------------------------------------------- dry run

type DraftKind = DraftRule["kind"];

const PRESETS: Record<DraftKind, { title: string; text: string }> = {
  "carry-depends-on": { title: "Add a default dependency", text: "A review of code in an area also depends on other paths. A change there stops the verdict carrying." },
  "require-review": { title: "Require a review", text: "Changes to some paths need an approval from a member or team." },
  "refuse-claim": { title: "Refuse some claims", text: "Members with some roles may not claim some paths." },
  "global-input": { title: "Add a global input", text: "Any change to these paths stops every verdict and check carrying." },
};

function DryRun() {
  const { adapter, snap } = useApp();
  const [kind, setKind] = useState<DraftKind>("carry-depends-on");
  const [id, setId] = useState("platform-reviews-authz");
  const [paths, setPaths] = useState("src/lib/authz/**");
  const [from, setFrom] = useState("@platform");
  const [count, setCount] = useState(1);
  const [roles, setRoles] = useState<Role[]>(["agent"]);
  const [area, setArea] = useState("src/lib/**");
  const [dependsOn, setDependsOn] = useState("src/lib/**");
  const [result, setResult] = useState<DryRunResult | Refusal | null>(null);
  const globs = (s: string) => s.split(/[\s,]+/).filter(Boolean);

  const draft = (): DraftRule => {
    switch (kind) {
      case "require-review":
        return { kind, id, paths: globs(paths), from: from as `@${string}`, count };
      case "refuse-claim":
        return { kind, id, paths: globs(paths), roles };
      case "carry-depends-on":
        return { kind, area, dependsOn: globs(dependsOn) };
      case "global-input":
        return { kind, paths: globs(paths) };
    }
  };

  return (
    <section class="section" aria-labelledby="dry-h">
      <div class="section-head">
        <h2 id="dry-h">Dry run a draft rule</h2>
        <p>Replays the room's history. Nothing is changed.</p>
      </div>
      <div class="card pad stack">
        <fieldset class="drafts" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend class="visually-hidden">Kind of draft rule</legend>
          {(Object.keys(PRESETS) as DraftKind[]).map((k) => (
            <label class="draft-opt" key={k}>
              <input
                type="radio"
                name="draft-kind"
                value={k}
                checked={kind === k}
                onChange={() => {
                  setKind(k);
                  setResult(null);
                  if (k === "refuse-claim") setId("agents-stay-out-of-authz");
                  if (k === "require-review") setId("platform-reviews-authz");
                }}
              />
              <span class="stack-sm">
                <strong>{PRESETS[k].title}</strong>
                <span class="small muted">{PRESETS[k].text}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <form
          class="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setResult(await adapter.dryRun(draft()));
          }}
        >
          <div class="drafts">
            {(kind === "require-review" || kind === "refuse-claim") && (
              <label class="field">
                <span>Rule ID</span>
                <input class="input mono" value={id} onInput={(e) => setId(e.currentTarget.value)} />
              </label>
            )}
            {kind === "carry-depends-on" ? (
              <>
                <label class="field">
                  <span>When a review covers</span>
                  <input class="input mono" value={area} onInput={(e) => setArea(e.currentTarget.value)} />
                </label>
                <label class="field">
                  <span>It also depends on</span>
                  <input class="input mono" value={dependsOn} onInput={(e) => setDependsOn(e.currentTarget.value)} />
                </label>
              </>
            ) : (
              <label class="field">
                <span>Paths</span>
                <input class="input mono" value={paths} onInput={(e) => setPaths(e.currentTarget.value)} />
              </label>
            )}
            {kind === "require-review" && (
              <>
                <label class="field">
                  <span>From</span>
                  <select class="select" value={from} onChange={(e) => setFrom(e.currentTarget.value)}>
                    {["@security", "@platform", ...snap.people.filter((p) => p.kind === "person").map((p) => p.handle)].map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </label>
                <label class="field">
                  <span>Approvals needed</span>
                  <input class="input" type="number" min={1} max={5} value={count} onInput={(e) => setCount(Number(e.currentTarget.value) || 1)} />
                </label>
              </>
            )}
            {kind === "refuse-claim" && (
              <fieldset class="field" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend class="small muted" style={{ fontWeight: 560 }}>
                  Roles
                </legend>
                <div class="row">
                  {(["agent", "member", "maintainer"] as Role[]).map((r) => (
                    <label key={r} class="row small">
                      <input type="checkbox" checked={roles.includes(r)} onChange={(e) => setRoles(e.currentTarget.checked ? [...roles, r] : roles.filter((x) => x !== r))} /> {r}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
          <div>
            <button class="btn primary" type="submit">
              Run against history
            </button>
          </div>
        </form>
        {result && (isRefusal(result) ? <RefusalNotice refusal={result} title="The dry run was refused" /> : <DryRunView r={result} />)}
      </div>
    </section>
  );
}

function DryRunView({ r }: { r: DryRunResult }) {
  const { snap } = useApp();
  if (r.status === "not-compiled")
    return (
      <div class="notice warn" role="status" data-testid="dry-run-result" data-status="not-compiled">
        <div class="notice-title">
          <Icon name="alert" /> This draft cannot be written as a faithful rule
        </div>
        <p class="small">{r.reason}</p>
        <p class="small">
          <strong>Fix:</strong> {r.fix}
        </p>
        <p class="small muted">Nothing was replayed, so there is no prediction to show.</p>
      </div>
    );
  return (
    <div class="stack" role="status" aria-live="polite" data-testid="dry-run-result" data-status="replayed">
      <p>
        <strong>{r.changes.length ? `${plural(r.changes.length, "outcome")} would change.` : "No outcome would change."}</strong>{" "}
        <span class="muted">
          Replayed {plural(r.examined.claims, "claim")}, {plural(r.examined.proposals, "proposal")} and {plural(r.examined.carried, "carry decision")} through the policy runtime ({r.stamp}),
          under the active policy and under the draft.
        </span>
      </p>
      {r.changes.length > 0 && (
        <ol class="stack-sm">
          {r.changes.map((c) => (
            <li class="change" key={`${c.seq}${c.act}${c.after}`}>
              <p class="small muted">
                Entry {c.seq}
                {c.lane && <> · {laneGoal(snap, c.lane)}</>} · {c.what}
              </p>
              <div class="change-arrow">
                <span>{c.before}</span>
                <span class="arrow" aria-hidden="true">
                  →
                </span>
                <span class="after">{c.after}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {r.mismatches.length > 0 && (
        <div class="notice warn" data-testid="dry-run-mismatches">
          <div class="notice-title">
            <Icon name="alert" /> Where this rule and path overlap disagree
          </div>
          <p class="small">The policy language has no glob function, so the compiled rule tests literal text. For these claims its answer differs from path overlap:</p>
          <ul class="stack-sm small">
            {r.mismatches.map((m) => (
              <li key={m.act}>
                Entry {m.seq}, {m.by}'s claim of <code>{m.scope.join(", ")}</code>:{" "}
                {m.kind === "missed" ? "it may cover these paths, but the rule would not refuse it." : "the rule would refuse it, though it cannot cover these paths."}
              </li>
            ))}
          </ul>
        </div>
      )}
      <details>
        <summary class="disclosure">
          <Icon name="chevron" class="chev" />
          As it would appear in .artroom/policy.json
        </summary>
        <pre class="expr" style={{ marginTop: "6px" }}>
          {JSON.stringify(r.compiled, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function PolicyScreen() {
  const { snap } = useApp();
  const doc = snap.policy.document;
  const outcomes = snap.policy.outcomes.slice().reverse().slice(0, 12);
  return (
    <>
      <header class="page-head">
        <h1>Policy</h1>
        <p>
          The repository owns its rules in <code>.artroom/policy.json</code>. The room applies them when each act is written: a refusal names its rule and a fix, and every outcome is
          recorded with the act.
        </p>
        {snap.policy.version && (
          <p class="small subtle">
            Active version {snap.policy.version}, since entry {snap.policy.activatedAt}. Changing it needs an admin's approval.
          </p>
        )}
      </header>
      <div class="two-col">
        <div>
          <section aria-labelledby="rules-h">
            <div class="section-head">
              <h2 id="rules-h">Rules</h2>
              <p>{doc ? plural(doc.rules.length, "rule") : ""}</p>
            </div>
            {doc ? (
              <ol class="rules">
                {doc.rules.map((r) => (
                  <RuleCard key={r.id} rule={r} />
                ))}
                <li class="card rule">
                  <div class="rule-head">
                    <Badge tone="outline">Owners</Badge>
                  </div>
                  <dl class="kv">
                    {Object.entries(doc.owners).map(([g, o]) => (
                      <Fragment key={g}>
                        <dt>
                          <Glob glob={g} />
                        </dt>
                        <dd>{join(o as string[])}</dd>
                      </Fragment>
                    ))}
                  </dl>
                </li>
                <li class="card rule">
                  <div class="rule-head">
                    <Badge tone="carried">Carry</Badge>
                    <span class="small subtle">When an earlier verdict may count for a new generation</span>
                  </div>
                  <p class="rule-body">
                    Verdicts {doc.carry.verdicts ? "carry" : "never carry"}, and checks {doc.carry.checks ? "carry" : "never carry"}, while nothing they covered has changed: the reviewed
                    paths, the declared dependencies, and the global inputs (lockfiles, build configuration, tests and <code>.artroom/**</code>).{" "}
                    {doc.carry.globalInputs.length ? `This room adds ${join(doc.carry.globalInputs as string[])}.` : "This room adds no global inputs."}{" "}
                    {Object.keys(doc.carry.dependsOn).length ? "" : "It declares no default dependencies."}
                  </p>
                </li>
              </ol>
            ) : (
              <div class="card pad muted">This room's transport cannot read the active policy document yet.</div>
            )}
            <section class="section card pad stack-sm" aria-labelledby="fixed-h">
              <h3 id="fixed-h" class="row">
                <Icon name="lock" /> What policy cannot change
              </h3>
              <ul class="stack-sm small muted">
                <li>A verdict stays bound to the head it reviewed. Carrying is shown, never silent.</li>
                <li>Changes to <code>.artroom/**</code> need an admin's approval.</li>
                <li>A reserved landing completes forward and is never released on a timer. Only a key revoked as compromised starts an abort attempt.</li>
                <li>Workspace and publication tokens never appear in the log, the API or this page.</li>
              </ul>
            </section>
          </section>
          <DryRun />
        </div>
        <section aria-labelledby="out-h">
          <div class="section-head">
            <h2 id="out-h">Recent outcomes</h2>
            <p>Newest first</p>
          </div>
          <div class="card pad">
            {outcomes.length ? (
              <ol class="outcomes">
                {outcomes.map((o) => (
                  <OutcomeRow key={`${o.seq}${o.act}${o.decision.rule}`} o={o} />
                ))}
              </ol>
            ) : (
              <p class="muted">No rule has fired yet.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
