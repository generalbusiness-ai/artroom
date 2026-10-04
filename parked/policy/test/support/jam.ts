/**
 * The jam's declarations, from notes/2026-10-02-declared-acts.md section
 * 7.1, as a fixture for the acts validator (docs/protocol.md R-DECL-24). The
 * acts, the `in-key` and `leader-only` rules, and `.artroom/checkers/in-key.json`
 * are copied from the note unchanged.
 */

export const JAM_ACTS = {
  "take-part": {
    label: "Take a part",
    targets: { none: ["open"] },
    body: { part: { type: "enum", values: ["bass", "keys", "drums", "sax"] } },
    who: { roles: ["member", "agent"] },
    hold: { scope: ["parts/{part}/**"], conflict: "exclusive", leaseSeconds: 14400, workspace: true },
    refusals: { "scope-overlap": { reason: "{holder} already plays this part.", fix: "Choose another part." } },
  },
  lead: {
    label: "Lead the song",
    targets: { none: ["open"] },
    who: { roles: ["member", "agent"] },
    hold: { scope: ["song.json"], conflict: "exclusive", leaseSeconds: 14400, workspace: true },
  },
  leave: {
    label: "Leave",
    targets: { thread: ["release"] },
    threads: ["take-part", "lead"],
    who: { roles: ["member", "agent"] },
  },
  "take-solo": {
    label: "Take the solo",
    targets: { none: ["open"], thread: ["take"] },
    threads: ["take-solo"],
    who: { roles: ["member", "agent"] },
    hold: { scope: ["solo/**"], conflict: "exclusive", leaseSeconds: 64, reserveSeconds: 8 },
    refusals: {
      "lane-held": { reason: "{holder} has the solo.", fix: "Signal to take the next one." },
      "scope-overlap": { reason: "{holder} has the solo.", fix: "Signal to take the next one." },
      reserved: { reason: "The solo was passed to {reservedFor}.", fix: "Wait until {until}, or signal." },
      "wrong-thread": { reason: "That is not the solo.", fix: "Take the solo thread." },
    },
  },
  "pass-solo": {
    label: "Pass the solo",
    targets: { thread: ["hand-over"] },
    threads: ["take-solo"],
    who: { roles: ["member", "agent"] },
    refusals: { "not-holder": { reason: "Only the soloist can pass the solo.", fix: "Signal instead." } },
  },
  signal: {
    label: "Signal",
    targets: { none: ["comment"], entry: ["comment"] },
    body: {
      signal: { type: "enum", values: ["count-in", "head", "ending", "one-more", "next"] },
      to: { type: "member", optional: true },
    },
    who: { roles: ["member", "agent"] },
  },
  "add-pattern": {
    label: "Add a pattern",
    targets: { thread: ["version", "land"] },
    threads: ["take-part"],
    body: { summary: { type: "text", max: 1024 } },
    who: { roles: ["member", "agent"] },
    refusals: { "outside-claim": { reason: "{path} is outside your part.", fix: "Change only your part's files." } },
  },
  "change-key": {
    label: "Change key",
    targets: { thread: ["version", "land"] },
    threads: ["lead"],
    body: { summary: { type: "text", max: 1024 } },
    who: { roles: ["member", "agent"] },
    refusals: {
      "not-holder": { reason: "Only the leader changes the key.", fix: "Signal the leader." },
      "wrong-thread": { reason: "The key is changed only in the song file.", fix: "Act on the lead thread." },
    },
  },
  "propose-rules": {
    label: "Propose house rules",
    targets: { none: ["open"], thread: ["version"] },
    threads: ["propose-rules"],
    body: { summary: { type: "text", max: 4096, requiredFor: ["thread"] } },
    who: { roles: ["member", "agent"] },
    hold: { scope: [".artroom/**"], conflict: "exclusive" },
  },
  "approve-rules": {
    label: "Approve house rules",
    targets: { version: ["review"] },
    threads: ["propose-rules"],
    body: { text: { type: "text", max: 1024 } },
    who: { roles: [] },
  },
  "adopt-rules": {
    label: "Adopt house rules",
    targets: { version: ["land"] },
    threads: ["propose-rules"],
    who: { roles: ["member", "agent"] },
  },
  "in-key-check": {
    label: "In key",
    targets: { version: ["check"] },
    threads: ["take-part"],
    who: { roles: ["checker"] },
  },
} as const;

export const JAM_RULES = [
  { id: "in-key", kind: "require", paths: ["parts/**"], obligation: { type: "check", check: "in-key", by: ["role:checker"] } },
  {
    id: "leader-only",
    kind: "refuse",
    on: ["lead", "change-key", "propose-rules", "adopt-rules"],
    refuse: '$not("@leader" in actor.teams) and actor.role != "admin"',
    reason: "Only the leader may do this.",
    fix: "Signal the leader.",
  },
] as const;

/** `.artroom/checkers/in-key.json`. */
export const IN_KEY = { format: "artroom-checker-v2", act: "in-key-check", inputs: ["parts/**", "song.json"], volatile: false, timeoutSeconds: 60 } as const;
