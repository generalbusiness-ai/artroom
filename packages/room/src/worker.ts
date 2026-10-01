/**
 * The Worker: the HTTPS routes (R-API-3) and the `ArtroomService` RPC
 * entrypoint that service bindings call (R-API-1, `RoomWire`).
 */

import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
import type {
  ActRecord,
  ArtroomFounder,
  ArtroomService,
  BearerAct,
  BearerRequest,
  ByteStream,
  Cursor,
  DraftedRoom,
  Genesis,
  Joined,
  ReadQuery,
  ReadResults,
  Redeemed,
  Redemption,
  Refusal,
  RoomDraft,
  RoomId,
  RoomWire,
  Session,
  SessionToken,
  SignedEnvelope,
  SignedRequest,
  WorkspaceGrant,
  WorkspaceOp,
} from "@generalbusiness/artroom-contract";
import { unwire, type Wire } from "./errors.ts";
import { clock, type RoomEnv } from "./config.ts";
import { draftRoom, foundRoom } from "./founding.ts";
import { roomStub, route } from "./http.ts";
import type { Room } from "./room.ts";

/**
 * `RoomWire` over a service binding. Each call is stateless on the server;
 * disposing it releases only this stub (R-API-2). `subscribe` returns a byte
 * stream of newline-delimited JSON `Update`s (see README, "Contract gaps").
 */
export class RoomWireTarget extends RpcTarget implements RoomWire {
  constructor(private readonly stub: DurableObjectStub<Room>) {
    super();
  }
  async submit(act: SignedEnvelope): Promise<ActRecord | Refusal> {
    return unwire((await this.stub.submit(act)) as Wire<ActRecord | Refusal>);
  }
  async request(req: SignedRequest): Promise<WorkspaceOp | WorkspaceGrant | Session | Refusal> {
    return unwire((await this.stub.request(req)) as Wire<WorkspaceOp | WorkspaceGrant | Session | Refusal>);
  }
  async redeem(redemption: Redemption): Promise<Joined | Redeemed | Refusal> {
    return unwire((await this.stub.redeem(redemption, "service-binding")) as Wire<Joined | Redeemed | Refusal>);
  }
  /** R-CRED-10: the room signs under the bearer's session key and delegation. */
  async bearerAct(bearer: string, act: BearerAct): Promise<ActRecord | Refusal> {
    return unwire((await this.stub.bearerAct(bearer, act)) as Wire<ActRecord | Refusal>);
  }
  async bearerRequest(bearer: string, req: BearerRequest): Promise<WorkspaceOp | WorkspaceGrant | Refusal> {
    return unwire((await this.stub.bearerRequest(bearer, req)) as Wire<WorkspaceOp | WorkspaceGrant | Refusal>);
  }
  async read<Q extends ReadQuery>(session: SessionToken, query: Q): Promise<ReadResults[Q["q"]]> {
    return unwire((await this.stub.read(session, query)) as Wire<ReadResults[Q["q"]]>);
  }
  /** Newline-delimited JSON `Update`s as UTF-8 bytes (R-API-8). */
  async subscribe(session: SessionToken, cursor?: Cursor): Promise<ByteStream> {
    return (await this.stub.subscribe(session, cursor)) as ReadableStream<Uint8Array>;
  }
  [Symbol.dispose](): void {}
}

/** The default export: `fetch` serves HTTPS; RPC methods serve `env.ARTROOM` bindings (`ArtroomService`, `ArtroomFounder`). */
export default class Artroom extends WorkerEntrypoint<RoomEnv> implements Omit<ArtroomService, "room">, ArtroomFounder {
  override async fetch(req: Request): Promise<Response> {
    return route(req, this.env);
  }

  /** `ArtroomService.room`: the RPC target for one room, by name or ID. */
  async room(room: string): Promise<RoomWireTarget> {
    return new RoomWireTarget((await roomStub(this.env, room)) as unknown as DurableObjectStub<Room>);
  }

  /** Founding, step 1 (R-GEN-10). */
  async draft(input: RoomDraft): Promise<DraftedRoom> {
    return draftRoom(this.env, input, clock());
  }

  /** Founding, step 2 (R-GEN-10). */
  async found(genesis: Genesis, sig: string, draft: string): Promise<RoomId> {
    return foundRoom(this.env, genesis, sig, draft, clock);
  }
}
