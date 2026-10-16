/**
 * The invitation link that `artroom invite` prints and `artroom join`, the page and the MCP server's `join` read: the
 * service, the repository's scopes, the invitation's number and secret, the handle, and the membership version the
 * invitation is in. Legacy cohorts present the invitation secret. Membership@6 treats it as an
 * invitation signing seed that stays private and creates a key-bound proof.
 */
import { invitationServiceUrl } from "./invitation-service.ts";
import type { ScopeId, ScopeRef } from "@generalbusiness/dap-contract";
import { isScopeId, isScopeRef, unb64url } from "@generalbusiness/artroom-bytes";

/** The repository's scopes as a link names them: no inbox, which `join` creates. */
export interface InvitedRepository { directory: ScopeRef; membership: ScopeRef; rules: ScopeId; destination: ScopeId }

/** `definition`: the version of membership that the invitation is in. A link made before it was carried names none. */
export interface InvitationLink { v: 1; service: string; repository: InvitedRepository; invitation: number; secret: string; handle: string; definition?: string }

export const INVITATION_LINK = "artroom-invite:";

/** The invitation that a link holds, or null when the text is no such link. */
export function invitationOf(text: string): InvitationLink | null {
  if (!text.startsWith(INVITATION_LINK)) return null;
  try {
    const bytes = unb64url(text.slice(INVITATION_LINK.length));
    const link = bytes && (JSON.parse(new TextDecoder().decode(bytes)) as InvitationLink);
    return link && link.v === 1 && typeof link.secret === "string" && Number.isSafeInteger(link.invitation) ? link : null;
  } catch {
    return null;
  }
}

/** Whether a link's service, handle, invitation and repository references have their shapes: a directory, a membership, two scope IDs. */
export function wellFormedInvitation(link: InvitationLink): boolean {
  return invitationServiceUrl(link.service) !== null && typeof link.handle === "string" && link.invitation >= 1
    && isScopeRef(link.repository?.directory) && link.repository.directory.kind === "directory"
    && isScopeRef(link.repository?.membership) && link.repository.membership.kind === "membership"
    && isScopeId(link.repository?.rules) && isScopeId(link.repository?.destination);
}
