/**
 * A small application that is not code review: a band keeps its setlist.
 * Its five acts use only steps and hold settings the Room runs today
 * (declared acts stage 2): no scope template, no hand-over, no comment
 * without an anchor, no two steps in one act. Between them they use every
 * declared field type, so the act form is exercised on all of them.
 *
 * The demo and the tests use it to show that the UI does not assume the
 * code-review verbs: nothing here is called claim, propose, review or note.
 */

import type { ActDeclaration, KindName } from "../contract.ts";

export const SETLIST_ACTS: Readonly<Record<KindName, ActDeclaration>> = {
  "start-song": {
    label: "Start a song",
    targets: { none: ["open"] },
    body: {
      title: { type: "text", max: 80 },
      key: { type: "enum", values: ["c", "d", "e-flat", "f", "g", "a", "b-flat"] },
      tempo: { type: "int", min: 40, max: 240 },
      swing: { type: "bool", optional: true },
    },
    who: { roles: ["member", "agent"] },
    hold: { scope: "body.scope", workspace: true, leaseSeconds: 3600 },
    refusals: { "scope-overlap": { reason: "{holder} is already working on those files.", fix: "Pick other files, or cue {holder}." } },
    help: "Opens a thread for one song. Its scope is the files you will write.",
  },
  "add-part": {
    label: "Add a part",
    targets: { thread: ["version"] },
    threads: ["start-song"],
    body: {
      instrument: { type: "enum", values: ["bass", "keys", "drums", "sax"] },
      section: { type: "segment" },
      bars: { type: "int", min: 1, max: 64 },
      charts: { type: "globs", max: 8, optional: true },
      summary: { type: "text", max: 1024, optional: true },
    },
    who: { roles: ["member", "agent"] },
    help: "Records a new version of the song with your part in it.",
  },
  cue: {
    label: "Cue",
    targets: { entry: ["comment"] },
    body: {
      signal: { type: "enum", values: ["count-in", "head", "ending", "one-more"] },
      to: { type: "member", optional: true },
      about: { type: "act", optional: true },
    },
    who: { roles: ["member", "agent"] },
    help: "A short signal to the band, attached to an entry.",
  },
  "sign-off": {
    label: "Sign off",
    targets: { version: ["review"] },
    threads: ["start-song"],
    body: { text: { type: "text", max: 1024, optional: true } },
    who: { roles: ["maintainer", "member"] },
    help: "Says a version of the song is ready, or objects to it.",
  },
  "wrap-up": {
    label: "Wrap up",
    targets: { thread: ["release"] },
    threads: ["start-song"],
    who: { roles: ["member", "agent"] },
    help: "Lets go of the song so someone else can pick it up.",
  },
};
