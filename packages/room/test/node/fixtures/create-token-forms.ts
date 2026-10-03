/**
 * A fixture for the mint lane C source scan (`mint-sites-scan.test.ts`): a
 * source file outside the allowed files that reaches Artifacts' token
 * creation in every syntactic form the scan must catch, one per line marked
 * `// reach`. Type positions and string arguments, which do not reach the
 * method, are marked `// not a reach`. Never imported or run.
 */
declare const repo: any;

export async function reaches(): Promise<void> {
  await repo.createToken("read", 60); // reach
  await repo.createToken?.("read", 60); // reach
  await repo?.createToken("read", 60); // reach
  await repo["createToken"]("read", 60); // reach
  await repo?.["createToken"]?.("read", 60); // reach
  await repo[`createToken`]("read", 60); // reach
  const make = repo.createToken.bind(repo); // reach
  const { createToken } = repo; // reach
  const { createToken: renamed } = repo; // reach
  const { "createToken": quoted } = repo; // reach
  void [make, createToken, renamed, quoted];
}

export function notReaches(count: (name: string) => void): void {
  type Make = { createToken(scope: string): void }["createToken"]; // not a reach
  let typed: typeof repo.createToken | undefined; // not a reach
  count("createToken"); // not a reach
  void (null as unknown as Make);
  void typed;
}
