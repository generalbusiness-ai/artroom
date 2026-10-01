/**
 * The Worker: the HTTPS routes (R-API-3) and the `ArtroomService` RPC
 * entrypoint that service bindings call (R-API-1, `RoomWire`).
 */

import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
import type {
  ActRecord,
  ArtroomService,
  Cursor,
  Genesis,
  Joined,
  ReadQuery,
  ReadResults,
  Redeemed,
  Redemption,
  Refusal,
  RoomId,
  RoomWire,
  Session,
  SessionToken,
  SignedEnvelope,
  SignedRequest,
  UpdateStream,
  WorkspaceGrant,
  WorkspaceOp,
} from "@generalbusiness/artroom-contract";
import type { RoomEnv } from "./config.ts";
import { unwire, type Wire } from "./errors.ts";
import { draftRoom, foundRoom, roomStub, route } from "./http.ts";
import type { Room } from "./room.ts";

/**
 * `RoomWire` over a service binding. Each call is stateless on the server;
 * disposing it releases only this stub (R-API-2). `subscribe` returns a byte
 * stream of newline-delimited JSON `Update`s (see README, "Contract gaps").
 */
export class RoomWireTarget extends RpcTarget implements Omit<RoomWire, "subscribe"> {
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
  async read<Q extends ReadQuery>(session: SessionToken, query: Q): Promise<ReadResults[Q["q"]]> {
    return unwire((await this.stub.read(session, query)) as Wire<ReadResults[Q["q"]]>);
  }
  async subscribe(session: SessionToken, cursor?: Cursor): Promise<ReadableStream<Uint8Array>> {
    return (await this.stub.subscribe(session, cursor)) as ReadableStream<Uint8Array>;
  }
  [Symbol.dispose](): void {}
}

/** The default export: `fetch` serves HTTPS; RPC methods serve `env.ARTROOM` bindings. */
export default class Artroom extends WorkerEntrypoint<RoomEnv> implements Omit<ArtroomService, "room"> {
  override async fetch(req: Request): Promise<Response> {
    return route(req, this.env);
  }

  /** `ArtroomService.room`: the RPC target for one room, by name or ID. */
  async room(room: string): Promise<RoomWireTarget> {
    return new RoomWireTarget((await roomStub(this.env, room)) as unknown as DurableObjectStub<Room>);
  }

  /** Founding, step 1 (an addition to the contract): the genesis to sign. */
  async draft(input: unknown): Promise<{ readonly genesis: Genesis; readonly draft: string }> {
    return draftRoom(this.env, input, Date.now());
  }

  /** Founding, step 2: the signed genesis. */
  async found(genesis: Genesis, sig: string, draft: string): Promise<RoomId> {
    return foundRoom(this.env, genesis, sig, draft);
  }
}

export type { UpdateStream };
