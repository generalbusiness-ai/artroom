/** Identifiers (R-ID-1, R-ID-3, R-ID-8) and the published log layout (R-LOG-9). */
import { describe, expect, it } from "vitest";
import type { Genesis } from "@generalbusiness/artroom-contract";
import { entryId, opIds, parseEntryId, pinnedRef, roomIdOf } from "../../src/ids.ts";
import { segmentName } from "../../src/log.ts";
import { digestJson } from "../../src/crypto.ts";

describe("identifiers", () => {
  it("R-ID-1: act_<seq>_<hash8>, parsed back by seq and prefix", () => {
    const h = digestJson({ x: 1 });
    const id = entryId(42, h);
    expect(id).toBe(`act_42_${h.slice(7, 15)}`);
    expect(parseEntryId(id)).toEqual({ seq: 42, hash8: h.slice(7, 15) });
    expect(parseEntryId("act_01_00000000")).toBeNull();
    expect(parseEntryId("act_1_0000000g")).toBeNull();
  });

  it("R-ID-3: the room ID depends on every genesis field", () => {
    const g: Genesis = {
      format: "artroom-log-v1",
      name: "acme/web",
      repo: "acme-web",
      admin: { handle: "@a", key: `key_${"A".repeat(43)}` },
      recovery: `key_${"B".repeat(43)}`,
      roomKey: `key_${"C".repeat(43)}`,
      profile: { policy: "artroom-jsonata-v1", jsonata: "2.2.2" },
      createdAt: "2026-10-01T00:00:00.000Z",
    };
    expect(roomIdOf(g)).toBe(`room_${digestJson(g).slice(7, 39)}`);
    expect(roomIdOf({ ...g, name: "acme/web2" })).not.toBe(roomIdOf(g));
  });

  it("R-ID-8 operation IDs and the pinned ref", () => {
    expect(opIds.land(17)).toBe("op_land_17");
    expect(opIds.preview(9)).toBe("op_preview_9");
    expect(opIds.workspace(7, 2)).toBe("op_ws_7_2");
    expect(pinnedRef("act_7_0c1d2e3f", 2)).toBe("refs/artroom/heads/act_7_0c1d2e3f/2");
  });

  it("R-LOG-9 segment names are 12 zero-padded digits", () => {
    expect(segmentName(0)).toBe("artroom-log/v1/segments/000000000000.jsonl");
    expect(segmentName(1000)).toBe("artroom-log/v1/segments/000000001000.jsonl");
  });
});
