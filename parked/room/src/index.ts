/**
 * @generalbusiness/artroom-room
 *
 * The Room: a Worker and one SQLite-backed Durable Object per repository,
 * the authoritative sequencer. See README.md and docs/protocol.md.
 */

export { default } from "./worker.ts";
export { Room } from "./room.ts";
export { Registry } from "./registry.ts";
// Lane B's publisher sandbox: the container Durable Object and its gateway, hosted by the Room Worker.
export { Publisher, ArtifactsGateway } from "@generalbusiness/artroom-git/publisher";
export { RoomWireTarget } from "./worker.ts";
export { RoomCore } from "./core.ts";
export { setServicesFactory, setClock, setAlarmDelay, setPinDelay, type ServicesFactory, type RoomEnv } from "./config.ts";
export { lanePolicy } from "./policy.ts";
export { ArtifactsAdapter, locate } from "./artifacts.ts";
export { FakeArtifactsHost, FakeRepo, FakeArtifactsError, artifactsErrors } from "./memory/artifacts.ts";
export { setFault } from "./core.ts";
export type * from "./ports.ts";
