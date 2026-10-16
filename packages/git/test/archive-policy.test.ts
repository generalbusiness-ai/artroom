import { expect, test, vi } from "vitest";
import { INVITATION_KEY_MEMBERSHIP } from "@generalbusiness/dap-contract";
import { textDigest } from "@generalbusiness/artroom-bytes";
import { admitArchiveExport } from "../src/archive-policy.ts";

// Policy only, with a SCRIPTED inventory and trusted certificate stand-in.
// No archive writer, native inventory, export permission or Git write runs.
test("v1 export admission refuses legacy membership whole before inventory and allows only the new pin or an exactly certified declaration", () => {
  const inventory = vi.fn(() => ({ customDomains: false, foreignCopies: false }));
  const declaration = textDigest("SCRIPTED checker-certified public definition");
  const certified = new Set([declaration]);
  for (const pin of ["platform:membership@1", "platform:membership@2", "platform:membership@4", "platform:membership@5"]) {
    expect(admitArchiveExport(pin, certified, inventory)).toEqual({ ok: false, reason: "unsupported-credential-cohort" });
  }
  expect(inventory).not.toHaveBeenCalled();
  expect(admitArchiveExport("platform:directory@9", certified, inventory)).toEqual({ ok: false, reason: "unsupported-archive-cohort" });
  expect(admitArchiveExport(textDigest("another declaration"), certified, inventory)).toEqual({ ok: false, reason: "unsupported-archive-cohort" });
  expect(inventory).not.toHaveBeenCalled();
  expect(admitArchiveExport(INVITATION_KEY_MEMBERSHIP, certified, inventory)).toEqual({ ok: true });
  expect(admitArchiveExport(declaration, certified, inventory)).toEqual({ ok: true });
  expect(admitArchiveExport(INVITATION_KEY_MEMBERSHIP, certified, () => ({ customDomains: true, foreignCopies: false }))).toEqual({ ok: false, reason: "unsupported-custom-domain" });
  expect(admitArchiveExport(INVITATION_KEY_MEMBERSHIP, certified, () => ({ customDomains: false, foreignCopies: true }))).toEqual({ ok: false, reason: "unsupported-foreign-copy" });
});
