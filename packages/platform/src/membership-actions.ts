/** Membership role names and action-list validation, without platform definitions or their rule engine. */

/** The most names of one list of actions, and the most bytes of one name (section 3.2). */
export const ACTIONS_MOST = 64;
const ACTION_BYTES = 64;

/**
 * A list of actions (section 3.2; section 12.1.8, row aa): at most 64
 * names, with no name twice, each of 1 to 64 bytes, and each byte a
 * lower-case ASCII letter, a digit, a hyphen or a full stop. It is the rule
 * that an extent's `approver` has (section 12.1.4). Every byte of such a
 * name is one character, so the length of the text is its bytes.
 */
export const isActions = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.length <= ACTIONS_MOST && new Set(value).size === value.length
  && value.every((name) => typeof name === "string" && name.length >= 1 && name.length <= ACTION_BYTES && /^[a-z0-9.-]+$/.test(name));

/** The five roles, and the value slot of the roster that holds the actions of each (section 12.1.3, the item `roster`). */
export const ROLE_LISTS = { admin: "adminActions", maintainer: "maintainerActions", member: "memberActions", agent: "agentActions", checker: "checkerActions" } as const;
export type Role = keyof typeof ROLE_LISTS;
