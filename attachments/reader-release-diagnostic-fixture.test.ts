/** Private checker controls at b359, original request 9ca1d290. */
import { expect, test } from "vitest";
import type { AttentionItem, AttentionPage, ByteStream, Cursor, RoomApi, Update, UpdateStream } from "@generalbusiness/artroom-contract";
import { decodeUpdates } from "../../client/src/room.ts";
import { callTool } from "../src/run.ts";

const cursor = "checker-live-tail" as Cursor;
const item: AttentionItem = { id: "checker-note", seq: 1, text: "Read this note.", open: true, why: "note", note: "act_1_12345678" };
const update: Update = { cursor, entries: [], attention: [item], publishedThrough: 1 };
type Mode = "timeout" | "item" | "existing";

async function exercise(adapter: "native" | "rpc-decoder", mode: Mode) {
  let cancelCalls = 0;
  let pageReads = 0;
  let readCalls = 0;
  let settledReads = 0;
  const readRejections: string[] = [];
  let updateController: ReadableStreamDefaultController<Update> | undefined;
  let byteController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const source = adapter === "native"
    ? new ReadableStream<Update>({ start(c) { updateController = c; }, cancel() { cancelCalls++; } })
    : new ReadableStream<Uint8Array>({ start(c) { byteController = c; }, cancel() { cancelCalls++; } });
  const stream: UpdateStream = adapter === "native" ? source as unknown as UpdateStream : decodeUpdates(source as unknown as ByteStream);
  let reader: ReturnType<UpdateStream["getReader"]> | undefined;
  // Preserve the native stream's own cancel method and lock semantics. Track the reader only for cleanup after assertions.
  const getReader = stream.getReader.bind(stream);
  stream.getReader = () => {
    reader = getReader();
    const read = reader.read.bind(reader);
    reader.read = async () => { readCalls++; try { return await read(); } catch (e) { readRejections.push(String(e)); throw e; } finally { settledReads++; } };
    return reader;
  };
  const page = (hasItem: boolean): AttentionPage => ({ items: hasItem ? [item] : [], cursor, more: false, publishedThrough: hasItem ? 1 : 0 });
  const api = {
    id: "room_checker",
    name: "checker",
    subscribe: async () => stream,
    attention: async () => { pageReads++; return page(mode === "existing" || (mode === "item" && pageReads > 1)); },
  } as unknown as RoomApi;
  let arrival: ReturnType<typeof setTimeout> | undefined;
  if (mode === "item") arrival = setTimeout(() => {
    if (adapter === "native") updateController!.enqueue(update);
    else byteController!.enqueue(new TextEncoder().encode(JSON.stringify(update) + "\n"));
  }, 5);
  try {
    const result = await callTool(api, "attention", { waitMs: mode === "timeout" ? 20 : 200 });
    // Allow cancellation to propagate back through the decoder's pipe without assuming a source callback is synchronous.
    for (let i = 0; i < 20 && cancelCalls === 0 && adapter === "rpc-decoder"; i++) await new Promise((resolve) => setTimeout(resolve, 1));
    console.info(JSON.stringify({ adapter, mode, cancelCalls, pageReads, readCalls, settledReads, readRejections, sourceLocked: source.locked, result }));
    expect(result.isError, "attention wait returns a normal page").toBe(false);
    expect(result.structuredContent?.["items"], "attention page matches the caller's fresh queue").toEqual(mode === "timeout" ? [] : [item]);
    expect(pageReads, "nonempty first page returns immediately; an empty first page is reread").toBe(mode === "existing" ? 1 : 2);
    expect(cancelCalls, "attention completion cancels its underlying subscription exactly once").toBe(1);
    expect(settledReads, "no reader read remains pending after attention completion").toBe(readCalls);
  } finally {
    clearTimeout(arrival);
    // The test owns the native reader. Clean up after capturing the defective state, rather than leaving an open test resource.
    if (adapter === "native" && reader !== undefined && source.locked) {
      await (reader as ReadableStreamDefaultReader<Update>).cancel();
      reader.releaseLock();
    }
  }
}

for (const mode of ["timeout", "item", "existing"] as const) {
  test(`native UpdateStream ${mode}: attention must cancel the subscription`, () => exercise("native", mode));
  test(`actual RPC decodeUpdates ${mode}: attention cancels the subscription`, () => exercise("rpc-decoder", mode));
}
