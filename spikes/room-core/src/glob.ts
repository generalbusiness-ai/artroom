// Path globs for policy rules, without regular expressions.
// "**" as a whole segment matches zero or more segments; "*" matches any run of
// characters within one segment; "?" matches one character. Matching is
// dynamic programming over segments and characters: O(pattern x path), no
// backtracking, so a hostile pattern cannot blow up.
export const GLOB_MAX = 1024;

function segment(p: string, s: string): boolean {
  // prev[j]: does p[0..i) match s[0..j)
  let prev = new Array<boolean>(s.length + 1).fill(false);
  prev[0] = true;
  for (let i = 1; i <= p.length; i++) {
    const c = p[i - 1];
    const cur = new Array<boolean>(s.length + 1).fill(false);
    cur[0] = c === "*" && prev[0];
    for (let j = 1; j <= s.length; j++) {
      if (c === "*") cur[j] = prev[j] || cur[j - 1];
      else cur[j] = prev[j - 1] && (c === "?" || c === s[j - 1]);
    }
    prev = cur;
  }
  return prev[s.length];
}

export function glob(path: string, pattern: string): boolean {
  if (path.length > GLOB_MAX || pattern.length > GLOB_MAX) throw new RangeError("glob argument too long");
  const ps = pattern.split("/");
  const ss = path.split("/");
  let prev = new Array<boolean>(ss.length + 1).fill(false);
  prev[0] = true;
  for (let i = 1; i <= ps.length; i++) {
    const p = ps[i - 1];
    const cur = new Array<boolean>(ss.length + 1).fill(false);
    if (p === "**") {
      cur[0] = prev[0];
      for (let j = 1; j <= ss.length; j++) cur[j] = prev[j] || cur[j - 1];
    } else {
      for (let j = 1; j <= ss.length; j++) cur[j] = prev[j - 1] && segment(p, ss[j - 1]);
    }
    prev = cur;
  }
  return prev[ss.length];
}
