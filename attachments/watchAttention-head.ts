async function watchAttention(room: RoomApi): Promise<AttentionWatch> {
  const handle = room as RoomApi & Subscribing;
  // A handle with no subscription: wait out the time, and let the second read answer.
  if (typeof handle.subscribe !== "function") return { arrives: sleep, close: async () => undefined };
  // Opened before the page is read, from the live tail, so an item that arrives between the two is seen.
  const first = await handle.subscribe(undefined, { waitMs: 0 });
  if (typeof (first as UpdateStream).getReader === "function") {
    const stream = first as UpdateStream;
    const reader = stream.getReader();
    return {
      async arrives(ms) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<"deadline">((resolve) => (timer = setTimeout(() => resolve("deadline"), ms)));
        try {
          for (;;) {
            const next = await Promise.race([reader.read(), deadline]);
            if (next === "deadline" || next.done) return;
            if (next.value.attention.length > 0) return; // GM:attention-items
          }
        } finally {
          clearTimeout(timer);
        }
      },
      close: () => stream.cancel().catch(() => undefined),
    };
  }
  let cursor = (first as Update).cursor;
  return {
    async arrives(ms) {
      const deadline = Date.now() + ms;
      for (;;) {
        const left = deadline - Date.now();
        if (left <= 0) return;
        const update = (await handle.subscribe!(cursor, { waitMs: left })) as Update;
        cursor = update.cursor;
        if (update.attention.length > 0) return; // GM:attention-items-poll
      }
    },
    close: async () => undefined,
  };
}
