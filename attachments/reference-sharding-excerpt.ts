/**
 * The shard directories that hold `name` among all the names of one
 * directory set (R-LOG-19). `key` is the name's 12 decimal digits or 64 hex
 * characters; `group` is 3 for decimal keys and 2 for hex keys. A directory
 * lists its names while it would hold at most `DIRECTORY_ENTRIES` of them;
 * otherwise it holds one subdirectory per distinct next group.
 */
export function shardsOf(names: readonly string[], name: string, key: (n: string) => string, group: 2 | 3): string[] {
  const k = key(name);
  const dirs: string[] = [];
  let members = names;
  while (members.length > DIRECTORY_ENTRIES) {
    const prefix = k.slice(0, (dirs.length + 1) * group);
    dirs.push(prefix.slice(-group));
    members = members.filter((m) => key(m).startsWith(prefix));
  }
  return dirs;
}
