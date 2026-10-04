/**
 * Invitation links. The contract has no link format, so the CLI reads this
 * one:
 *
 *   https://<host>/rooms/<roomId>/join#i=<invitationId>&s=<secret>
 *
 * The invitation and secret are in the fragment, which browsers and
 * servers do not send or log. The room's API is at the same origin.
 */

import { isActId, isRoomId, type InvitationId, type RoomId } from "@generalbusiness/artroom-contract";

export interface Invitation {
  readonly url: `https://${string}`;
  readonly room: RoomId;
  readonly invitation: InvitationId;
  readonly secret: string;
}

export function invitationLink(url: string, room: RoomId, invitation: InvitationId, secret: string): string {
  return `${url.replace(/\/+$/, "")}/rooms/${room}/join#i=${invitation}&s=${secret}`;
}

/** Parses a link, or returns a sentence saying what is wrong. */
export function parseInvitation(link: string): Invitation | string {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return "That is not an invitation link. It looks like https://<host>/rooms/<room>/join#i=<invitation>&s=<secret>.";
  }
  const room = /\/rooms\/(room_[0-9a-f]{32})\/join\/?$/.exec(u.pathname)?.[1];
  const params = new URLSearchParams(u.hash.replace(/^#/, ""));
  const invitation = params.get("i") ?? "";
  const secret = params.get("s") ?? "";
  if (!room || !isRoomId(room)) return "The link does not name a room. Ask for the full invitation link.";
  if (!isActId(invitation) || !/^[A-Za-z0-9_-]{43,}$/.test(secret)) return "The link is missing its invitation or secret. Copy the whole link, including the part after #.";
  const base = `${u.origin}${u.pathname.slice(0, u.pathname.indexOf(`/rooms/${room}`))}` as `https://${string}`;
  return { url: base, room, invitation, secret };
}
