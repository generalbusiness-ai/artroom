/**
 * Inventories built in memory from the real definitions, for the Node tests of the derivation and the list. No scope is read:
 * these are the inputs `readInventory` would give for a room whose scopes pin these definitions, with a standing the test states.
 */
import type { DeclaredDefinition, Digest, PlatformDefinition, ScopeId, ScopeRef } from "@generalbusiness/dap-contract";
import { definitionDigest } from "@generalbusiness/artroom-bytes";
import { FIRST_ACTIONS_OF, platform } from "@generalbusiness/dap-platform";
import { changeDemo, issueDemo } from "@generalbusiness/dap-lanes";
import type { DefinitionLike, Held, Inventory, Place, Standing } from "../../src/index.ts";

export const MEMBERSHIP = "sc_membershipxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" as ScopeId;
const ref = (scope: string, kind: ScopeRef["kind"]): ScopeRef => ({ scope: scope as ScopeId, inc: "in_aaaaaaaaaaaaaaaaaaaaaaaaaa", kind });

export function heldOf(scope: string, place: Place, pinned: Digest | PlatformDefinition, definition: DefinitionLike, membership: ScopeId | null = MEMBERSHIP): Held {
  const kind = place === "partition" ? "directory" : place === "lane" || place === "root" || place === "application" ? "lane" : place;
  return { scope: scope as ScopeId, ref: ref(scope, kind), place, pinned, definition, membership };
}

export const platformData = (named: PlatformDefinition): DefinitionLike => platform(named)!.data as unknown as DefinitionLike;
export const declared = (d: DeclaredDefinition): DefinitionLike => d as unknown as DefinitionLike;

/** The six platform scopes of a room on the default cohort. */
export function platformScopes(): Held[] {
  return [
    heldOf("sc_register", "register", "platform:register@3", platformData("platform:register@3")),
    heldOf("sc_directory", "directory", "platform:directory@3", platformData("platform:directory@3")),
    heldOf(MEMBERSHIP, "membership", "platform:membership@2", platformData("platform:membership@2")),
    heldOf("sc_rules", "rules", "platform:rules@2", platformData("platform:rules@2")),
    heldOf("sc_destination", "destination", "platform:destination@3", platformData("platform:destination@3")),
    heldOf("sc_inbox", "inbox", "platform:inbox@1", platformData("platform:inbox@1")),
  ];
}

export const lane = (n: number, d: DeclaredDefinition): Held => heldOf(`sc_lane${n}`, "lane", definitionDigest(d), declared(d));

/** A standing on the membership of a role, with that role's first actions. */
export function standingOf(role: string, membership: PlatformDefinition = "platform:membership@2"): Standing {
  const actions = (FIRST_ACTIONS_OF as Record<string, Record<string, readonly string[]>>)[membership]?.[role] ?? [];
  return { known: true, role, actions, handle: "@caller", key: "key_caller" };
}

export const ACTIVE_DEMO = [{ name: "change", digest: definitionDigest(changeDemo) }, { name: "issue", digest: definitionDigest(issueDemo) }];

/** The demo room: the six platform scopes, one issue lane and one change lane under the demo profiles. */
export function demoInventory(role: string, extra: readonly Held[] = []): Inventory {
  return { scopes: [...platformScopes(), lane(1, issueDemo), lane(2, changeDemo), ...extra], standing: { [MEMBERSHIP]: standingOf(role) }, roots: [], active: ACTIVE_DEMO };
}
