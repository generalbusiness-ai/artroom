import { expect, test } from "vitest";
import type { Operation } from "@generalbusiness/dap-derive";
import { t } from "@generalbusiness/dap-derive/testing";
import { publicationOrigin } from "../src/destination.ts";
import { Branch, NEXT } from "./support-destination.ts";

// Original Branch fixture: scripted lanes, observations and host answers,
// real derive judges. No flag, origin facts, platform data or effect changes.
test("publication origin metadata resolves an owed receipt's final publication and permits only independent founding or cleanup work", () => {
  const b = new Branch(false).ready();
  const { publication, push, mint } = b.reserved();
  const sender = b.item(publication).refs["operation"];
  const expected = { from: sender, directory: b.bureau.at, destination: b.at };
  expect(publicationOrigin(b.state, b.state.operation(push)!, b.own)).toEqual(expected);
  expect(b.answered(mint, 1, "confirmed", { token: "scripted-publication-token", ends: t(600) }).result).toBe("write");
  expect(b.answered(push, 1, "confirmed", { send: "accepted", seen: NEXT }).result).toBe("write");
  const receipt = b.head.seq;
  expect(b.item(publication).state).toBe("published");
  expect(b.item(receipt).type).toBe("receipt");
  const writes = b.state.operationsFor(publication);
  const receiptWrite = writes.find(operation => operation.kind === "receipt")!;
  const receiptMint = writes.filter(operation => operation.kind === "mint").at(-1)!;
  expect(publicationOrigin(b.state, receiptWrite, b.own)).toEqual(expected);
  expect(publicationOrigin(b.state, receiptMint, b.own)).toEqual(expected);
  const classified = (kind: string): Operation => ({ id: "999:0", owner: "platform:destination@3", kind,
    most: 1, attempts: [], selected: null, for: publication });
  // These classifications are SCRIPTED and never inserted or dispatched.
  for (const kind of ["revoke", "reservation-delete", "first-head", "mint-read"]) expect(publicationOrigin(b.state, classified(kind), b.own)).toBeNull();
  const deletion = classified("reservation-delete"), cleanupMint: Operation = { ...classified("mint"), id: "999:1" };
  // Read-only SCRIPTED classification of a cleanup write/mint opening;
  // neither operation nor any made-up entry is inserted into the ledger.
  const cleanupState = new Proxy(b.state, { get(target, property) {
    if (property === "operation") return (id: Operation["id"]) => id === deletion.id ? deletion : id === cleanupMint.id ? cleanupMint : target.operation(id);
    const value: unknown = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  expect(publicationOrigin(cleanupState, cleanupMint, b.own)).toBeNull();
  expect(publicationOrigin(b.state, { ...classified("judge"), for: 999 }, b.own)).toBe(false);
});
