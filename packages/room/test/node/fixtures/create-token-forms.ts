/**
 * A fixture for the mint lane C source scan (`mint-sites-scan.cases.ts`): a
 * source file outside the allowed files that reaches Artifacts' token
 * creation in every syntactic form the scan must catch, one per line marked
 * `// reach`, executable TypeScript syntax included (namespaces, enums,
 * assertions, parameter properties, class fields, decorators). Type
 * positions, declarations and string arguments, which do not reach the
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

// Executable TypeScript syntax: emitted, so every form here reaches the method (review 993dce7a).
export namespace CheckerMintProbe {
  export const issue = () => repo.createToken?.("read", 60); // reach
}
export enum Minted {
  Token = repo.createToken("read", 60), // reach
}
export const asserted = repo.createToken as unknown; // reach
export const nonNull = repo.createToken!; // reach
export const satisfied = repo.createToken satisfies unknown; // reach
export const cast = <unknown>repo.createToken; // reach
declare const generic: { createToken<T>(scope: T): T };
export const instantiated = generic.createToken<string>; // reach
declare const dec: (x: unknown) => (target: unknown, context: unknown) => void;
export class Holder {
  constructor(private readonly made = repo.createToken("read", 60)) {} // reach
  field = repo.createToken; // reach
  @dec(repo.createToken) // reach
  method(): unknown {
    return this.made;
  }
}

export function notReaches(count: (name: string) => void): void {
  type Make = { createToken(scope: string): void }["createToken"]; // not a reach
  let typed: typeof repo.createToken | undefined; // not a reach
  count("createToken"); // not a reach
  void (null as unknown as Make);
  void typed;
}

// Declarations are erased: nothing here reaches the method.
declare const declared: typeof repo.createToken; // not a reach
declare namespace Ambient {
  const value: typeof repo.createToken; // not a reach
}
export interface Shape {
  make: typeof repo.createToken; // not a reach
}
export type Alias = typeof repo.createToken; // not a reach
export function useDeclared(): unknown {
  return [declared, Ambient];
}
