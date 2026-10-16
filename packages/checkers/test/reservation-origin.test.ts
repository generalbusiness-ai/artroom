/** Pure checker snapshot boundary. The retained @3 record supplies signed
 * source/object bytes; changing its outcome owner below is a synthetic
 * cohort-selection control, not a recorded native @5 run or a Git checkout. */
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { Digest, ReservationSnapshot } from "@generalbusiness/dap-contract";
import { entryHash, factRefOf, parseStrict, unb64url } from "@generalbusiness/artroom-bytes";
import { originOf, type Notice, type OriginRead } from "../src/index.ts";

type Stored = { configurationDigest: Digest; snapshot: Omit<ReservationSnapshot, "objects"> & { objects: { id: string; type: "blob" | "tree" | "commit"; data: string }[] } };
const saved = parseStrict(readFileSync(new URL("./fixtures/reservation-record.json", import.meta.url), "utf8")) as unknown as Stored;
const snapshot = (): ReservationSnapshot => ({ ...structuredClone(saved.snapshot), objects: saved.snapshot.objects.map(object => {
  const data = unb64url(object.data); if (!data) throw Error("Recorded object has invalid base64url bytes");
  return { ...object, data };
}) });

test("the checker accepts the explicit D1 reservation owner while unknown and previously unsupported cohorts remain refused", () => {
  for (const version of [3, 5, 4, 6]) {
    const reservation = snapshot(), input = reservation.reservation.entry.input;
    if (input.type !== "outcome") throw Error("Recorded reservation is an outcome");
    input.owner = `platform:destination@${version}`;
    reservation.reservation.hash = entryHash(reservation.reservation.entry);
    reservation.ref = `refs/artroom/reservations/${reservation.reservation.hash.slice(7)}`;
    const name = reservation.job.entry.effects.find(effect => effect.effect === "value" && effect.slot === "name");
    if (name?.effect !== "value" || typeof name.value !== "string") throw Error("Recorded job names its check");
    const notice: Notice = { lane: reservation.job.entry.at, job: factRefOf(reservation.job.entry), name: name.value, tree: reservation.tree };
    const read: OriginRead = { entry: reservation.job, manifest: reservation.manifest, pinned: saved.configurationDigest, activated: { name: "change", state: "active" }, reservation };
    const result = originOf(notice, read);
    if (version === 3 || version === 5) expect(result).toMatchObject({ job: { commit: reservation.commit, ref: reservation.ref, tree: reservation.tree } });
    else expect(result).toEqual({ not: "no-manifest" });
  }
});
