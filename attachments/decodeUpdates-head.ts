export function decodeUpdates(bytes: ByteStream): UpdateStream {
  const updates = asReadable(bytes).pipeThrough(new TextDecoderStream("utf-8", { fatal: true }) as unknown as ReadableWritablePair<string, Uint8Array>).pipeThrough(splitUpdates());
  let active: ReadableStreamDefaultReader<Update> | undefined;
  return {
    getReader: () => {
      const reader = updates.getReader();
      active = reader;
      return {
        read: async () => {
          try {
            const r = await reader.read();
            return r.done ? { done: true as const } : { done: false as const, value: r.value };
          } catch (e) {
            throw streamError(e);
          }
        },
        releaseLock: () => {
          if (active === reader) active = undefined;
          reader.releaseLock();
        },
      };
    },
    cancel: async (reason?: unknown) => {
      try {
        if (active !== undefined) {
          const reader = active;
          active = undefined;
          await reader.cancel(reason); // resolves pending reads as done, and cancels back through the pipe
          reader.releaseLock();
        } else if (!updates.locked) await updates.cancel(reason);
      } catch (e) {
        throw streamError(e);
      }
    },
  };
}
