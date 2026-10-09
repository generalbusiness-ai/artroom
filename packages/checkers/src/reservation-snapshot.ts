/** Verify the readonly object overlay before giving it to a runner. */
import type { ReservationSnapshot } from "@generalbusiness/artroom-contract";
import { utf8 } from "@generalbusiness/artroom-bytes";
import { Reader, READ_BOUNDS, idOf, snapshotFiles } from "@generalbusiness/artroom-git";

export async function verifyReservationObjects(snapshot: ReservationSnapshot): Promise<boolean> {
  try {
    if (snapshot.objects.length > READ_BOUNDS.closureObjects) return false;
    const objects = new Map(snapshot.objects.map((object) => [object.id, object]));
    if (objects.size !== snapshot.objects.length) return false;
    const reached = new Set<string>();
    const reader = new Reader({
      object: async (id, limit) => { const object = objects.get(id); if (!object || object.data.length > limit || idOf(object.type, object.data) !== id) return null; reached.add(id); return { type: object.type, size: object.data.length, data: object.data }; },
      ref: async () => null, refs: async () => [],
    }, READ_BOUNDS);
    const commit = await reader.linked(snapshot.commit);
    if (commit.tree !== snapshot.tree || commit.parents[0] !== snapshot.base || !(await reader.closure(snapshot.commit)).complete || reached.size !== objects.size) return false;
    const files = await snapshotFiles(reader, snapshot.tree, () => true);
    const baseCommit = await reader.linked(snapshot.base);
    const before = new Map((await snapshotFiles(reader, baseCommit.tree, () => true)).map((file) => [file.path, file]));
    const after = new Map(files.map((file) => [file.path, file]));
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((path) => before.get(path)?.id !== after.get(path)?.id || before.get(path)?.mode !== after.get(path)?.mode);
    const declared = new Set(snapshot.sources.map((source) => source.entry.input.type === "act" ? source.entry.input.signed.intent.fields["path"] : null));
    if (changed.some((path) => !declared.has(path))) return false;
    for (const source of snapshot.sources) {
      if (source.entry.input.type !== "act") return false;
      const fields = source.entry.input.signed.intent.fields;
      const file = files.find((file) => file.path === fields["path"]);
      if (!file || typeof fields["content"] !== "string") return false;
      const bytes = utf8(fields["content"]);
      const blob = await reader.blob(file.id);
      if (blob.length !== bytes.length || !blob.every((byte, n) => byte === bytes[n])) return false;
    }
    return true;
  } catch { return false; }
}
