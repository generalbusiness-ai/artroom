/**
 * Mint lane C (request 5ff58c9a), test 6 of notes/2026-10-02-canonical-mint-ownership.md:
 * a source scan. Outside the harnesses, `measure/` and tests, only the files
 * below reach Artifacts' token creation (R-MINT-1). Every canonical mint goes
 * through the mint ledger (`mints.ts`); the others mint on repositories that
 * are not the canonical one. Since request 02836f9a, the lane fork's read
 * token for pinning is minted by the fork's own ledger
 * (`workspace/fork-tokens.ts`), and `publisher/client.ts` reaches
 * `createToken` nowhere.
 *
 * The scan is syntactic (review b84aead9): each production source file is
 * parsed with Babel's TypeScript parser (TypeScript 7, the native compiler,
 * ships no in-process parser), and every property access, optional or not,
 * every element access by the literal name, and every destructuring that
 * takes `createToken` is a reach. The scan descends into every node except
 * the syntax TypeScript erases (`ERASED`: type positions and type-only
 * declarations), so executable TypeScript (namespaces, enums,
 * assertions, parameter properties, decorators) is scanned like JavaScript
 * (review 993dce7a); a TypeScript node it does not know stops the scan.
 * Type positions (`RepoHandle["createToken"]`, `typeof x.createToken`),
 * declarations (the `RepoHandle` interface, the in-memory fake's method)
 * and string arguments are not reaches. A name built at runtime
 * (`"create" + "Token"`) is out of reach of any scan.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";

const ROOT = decodeURIComponent(new URL("../../../../", import.meta.url).pathname);

/** The allowed files: how many reaches each has, and why. */
const ALLOWED: Readonly<Record<string, { readonly reaches: number; readonly why: string }>> = {
  "packages/git/src/mints.ts": { reaches: 1, why: "the canonical mint ledger: every canonical mint (R-MINT-1)" },
  "packages/git/src/workspace/workspaces.ts": { reaches: 1, why: "a lane fork's workspace lease token (R-CRED-8), not a canonical mint" },
  "packages/git/src/snapshot/repos.ts": { reaches: 1, why: "a snapshot repository's job token (R-CARRY-16), not a canonical mint" },
  "packages/git/src/workspace/fork-tokens.ts": {
    reaches: 1,
    why: "the lane forks' read-token ledger, which the workspaces own (request 02836f9a): a lane fork's read token for pinning, not a canonical mint",
  },
};
/** In an allowed file, the function each reach must be inside, when it is fixed. None is, since request 02836f9a removed `withForkToken`. */
const INSIDE: Readonly<Record<string, string>> = {};

type AstNode = { readonly type: string; readonly loc?: { readonly start: { readonly line: number } } } & Record<string, unknown>;

/**
 * TypeScript syntax the compiler erases: type positions and type-only
 * declarations. The scan does not descend into these, and only these
 * (review 993dce7a).
 */
const ERASED: ReadonlySet<string> = new Set([
  // Type annotations, parameters and arguments.
  "TSTypeAnnotation",
  "TSTypeParameterDeclaration",
  "TSTypeParameterInstantiation",
  "TSTypeParameter",
  // Types.
  "TSAnyKeyword",
  "TSBigIntKeyword",
  "TSBooleanKeyword",
  "TSIntrinsicKeyword",
  "TSNeverKeyword",
  "TSNullKeyword",
  "TSNumberKeyword",
  "TSObjectKeyword",
  "TSStringKeyword",
  "TSSymbolKeyword",
  "TSUndefinedKeyword",
  "TSUnknownKeyword",
  "TSVoidKeyword",
  "TSThisType",
  "TSFunctionType",
  "TSConstructorType",
  "TSTypeReference",
  "TSTypePredicate",
  "TSTypeQuery",
  "TSTypeLiteral",
  "TSArrayType",
  "TSTupleType",
  "TSOptionalType",
  "TSRestType",
  "TSNamedTupleMember",
  "TSUnionType",
  "TSIntersectionType",
  "TSConditionalType",
  "TSInferType",
  "TSParenthesizedType",
  "TSTypeOperator",
  "TSIndexedAccessType",
  "TSMappedType",
  "TSTemplateLiteralType",
  "TSLiteralType",
  "TSImportType",
  "TSQualifiedName",
  // Type-only declarations and their members.
  "TSInterfaceDeclaration",
  "TSInterfaceBody",
  "TSInterfaceHeritage",
  "TSClassImplements",
  "TSExpressionWithTypeArguments",
  "TSTypeAliasDeclaration",
  "TSPropertySignature",
  "TSMethodSignature",
  "TSIndexSignature",
  "TSCallSignatureDeclaration",
  "TSConstructSignatureDeclaration",
  "TSDeclareFunction",
  "TSDeclareMethod",
  "TSNamespaceExportDeclaration",
]);
/** TypeScript syntax that is emitted: the scan descends into these like any JavaScript node. */
const EXECUTABLE: ReadonlySet<string> = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSInstantiationExpression",
  "TSEnumDeclaration",
  "TSEnumBody",
  "TSEnumMember",
  "TSModuleDeclaration",
  "TSModuleBlock",
  "TSParameterProperty",
  "TSExportAssignment",
  "TSImportEqualsDeclaration",
  "TSExternalModuleReference",
]);

const NAME = "createToken";
/** A key or property that is the literal name: an identifier (not computed), a string, or a template with no substitution. */
function names(key: unknown, computed: boolean): boolean {
  let k = key as AstNode | null;
  // A TypeScript assertion around a computed key is erased: `repo["createToken" as "createToken"]` takes the method.
  while (k && computed && (k.type === "TSAsExpression" || k.type === "TSSatisfiesExpression" || k.type === "TSNonNullExpression" || k.type === "TSTypeAssertion")) k = k["expression"] as AstNode | null;
  if (!k) return false;
  if (k.type === "Identifier") return !computed && k["name"] === NAME;
  if (k.type === "StringLiteral") return k["value"] === NAME;
  if (k.type === "TemplateLiteral") {
    const q = k["quasis"] as { value: { cooked: string } }[];
    return (k["expressions"] as unknown[]).length === 0 && q.length === 1 && q[0]!.value.cooked === NAME;
  }
  return false;
}

/** Every reach of `createToken` in one source: its line, and the function it is inside, if any. */
function reaches(text: string, jsx = false): { line: number; inside: string | null }[] {
  const ast = parse(text, { sourceType: "module", plugins: jsx ? ["typescript", "jsx", "decorators"] : ["typescript", "decorators"], errorRecovery: false }) as unknown as AstNode;
  const out: { line: number; inside: string | null }[] = [];
  const walk = (n: unknown, inside: string | null) => {
    if (Array.isArray(n)) return n.forEach((x) => walk(x, inside));
    if (!n || typeof n !== "object" || typeof (n as AstNode).type !== "string") return;
    const node = n as AstNode;
    // Erased syntax never reaches a value: type positions and type-only declarations. (`declare` declarations are
    // scanned too: an ambient context holds only types, which are erased within it.)
    if (ERASED.has(node.type)) return;
    // Any other TypeScript node must be known to be emitted, or the scan stops: a new kind is classified, never skipped.
    if (node.type.startsWith("TS") && !EXECUTABLE.has(node.type)) throw new Error(`the scan does not know TypeScript node ${node.type}: classify it as erased or executable`);
    // `import alias = Namespace.createToken` takes a value too.
    if (node.type === "TSImportEqualsDeclaration" && node["importKind"] !== "type") {
      const ref = node["moduleReference"] as AstNode;
      if (ref.type === "TSQualifiedName" && names(ref["right"], false)) out.push({ line: node.loc?.start.line ?? 0, inside });
    }
    const fn = node.type === "FunctionDeclaration" ? (((node["id"] as AstNode | null)?.["name"] as string | undefined) ?? inside) : inside;
    const line = node.loc?.start.line ?? 0;
    if ((node.type === "MemberExpression" || node.type === "OptionalMemberExpression") && names(node["property"], node["computed"] === true)) out.push({ line, inside: fn });
    if (node.type === "ObjectPattern")
      for (const p of node["properties"] as AstNode[]) if (p.type === "ObjectProperty" && names(p["key"], p["computed"] === true)) out.push({ line: p.loc?.start.line ?? line, inside: fn });
    for (const [k, v] of Object.entries(node)) if (k !== "loc" && k !== "leadingComments" && k !== "trailingComments" && k !== "innerComments") walk(v, fn);
  };
  walk(ast, null);
  return out;
}

/**
 * Could this source hold the name at all? A reach is an identifier, a string
 * or a template whose value is the name. Its text is then the name itself;
 * or the name with a backslash before some characters (`"cre\ateToken"` is
 * the same string); or it has a numbered escape (`\u`, `\x`, a digit) or a
 * line continuation. A file with none of these has no reach, and is not
 * parsed: most of the 190 source files are not, which is most of the scan's
 * cost.
 */
function mayName(text: string): boolean {
  if (/\\(?:[0-9ux]|\r?\n|\u2028|\u2029)/.test(text)) return true;
  return text.replace(/\\/g, "").includes(NAME);
}

/** What breaks the rule in these files: one line each, or none. */
function violations(files: readonly { readonly path: string; readonly text: string }[]): string[] {
  const out: string[] = [];
  for (const { path, text } of files) {
    const found = mayName(text) ? reaches(text, /\.[jt]sx$/.test(path)) : [];
    const allowed = ALLOWED[path];
    if (!allowed) {
      for (const r of found) out.push(`${path}:${r.line}: reaches createToken outside the allowed files`);
      continue;
    }
    if (found.length !== allowed.reaches) out.push(`${path}: ${found.length} reaches of createToken, allowed ${allowed.reaches}`);
    const fn = INSIDE[path];
    if (fn) for (const r of found) if (r.inside !== fn) out.push(`${path}:${r.line}: reaches createToken outside ${fn}`);
  }
  return out;
}

/** Every production source file: `packages/*\/src`, never `measure/`, `test/` or `test-workers/`. */
function sources(): { path: string; text: string }[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") walk(p);
      } else if (/\.(ts|tsx|js|mjs|cjs|jsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(relative(ROOT, p).split("\\").join("/"));
    }
  };
  for (const pkg of readdirSync(join(ROOT, "packages"), { withFileTypes: true }))
    if (pkg.isDirectory()) {
      try {
        walk(join(ROOT, "packages", pkg.name, "src"));
      } catch {
        // a package without `src`
      }
    }
  return out.sort().map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }));
}

describe("mint lane C (6): who reaches createToken", () => {
  it("outside the harnesses, measure/ and tests, only the canonical ledger, workspaces, snapshot repositories and the fork token ledger reach createToken, each once", () => {
    const files = sources();
    // The scan reaches the former canonical sites, every allowed file, the declaration and the fake, and every package's source.
    for (const f of [
      "packages/room/src/core.ts",
      "packages/room/src/logremote.ts",
      "packages/room/src/jobs.ts",
      "packages/git/src/landing/engine.ts",
      "packages/git/src/artifacts.ts",
      "packages/git/src/publisher/client.ts",
      "packages/room/src/memory/artifacts.ts",
      ...Object.keys(ALLOWED),
    ])
      expect(files.map((x) => x.path)).toContain(f);
    expect(files.length).toBeGreaterThan(100);
    expect(violations(files)).toEqual([]);
  });

  it("publisher/client.ts reaches createToken nowhere (request 02836f9a): its canonical tokens go through the canonical ledger, and the fork's read token through the fork token ledger", () => {
    const text = readFileSync(join(ROOT, "packages/git/src/publisher/client.ts"), "utf8");
    expect(reaches(text)).toEqual([]);
    expect(text).not.toContain("withForkToken");
    expect(text).toMatch(/this\.o\.forkTokens\.withToken\(fork\.name, `pin-objects:/);
    for (const purpose of ["integrate:", "pin-objects:", "pin-ref:", "preview:"]) expect(text).toContain(`\`${purpose}`);
  });

  it("an actual source file outside the allowed files, with every form of reach, fails on each of those lines and no other (the checker's repo.createToken?.('read', 60) among them)", () => {
    const path = "packages/room/test/node/fixtures/create-token-forms.ts";
    const text = readFileSync(join(ROOT, path), "utf8");
    const lines = text.split("\n");
    const marked = lines.flatMap((l, i) => (l.endsWith("// reach") ? [i + 1] : []));
    expect(marked).toHaveLength(20);
    expect(lines.some((l) => l.includes("repo.createToken?.(\"read\", 60); // reach"))).toBe(true);
    expect(violations([{ path, text }])).toEqual(marked.map((n) => `${path}:${n}: reaches createToken outside the allowed files`));
  });

  it("a name written with escapes, or under a type assertion, is still a reach; a file that cannot hold the name is not parsed", () => {
    const path = "packages/room/src/escaped-probe.ts";
    for (const [what, form] of [
      ["a backslash before a letter", String.raw`repo["cre\ateToken"]("read", 60);`],
      ["a unicode escape in a string", String.raw`repo["create\u0054oken"]("read", 60);`],
      ["a hex escape in a template", "repo[`create" + String.raw`\x54` + "oken`](\"read\", 60);"],
      ["a unicode escape in an identifier", String.raw`repo.cre\u0061teToken("read", 60);`],
      ["a line continuation", 'repo["create\\\nToken"]("read", 60);'],
    ] as const)
      expect(violations([{ path, text: `declare const repo: any;\n${form}\n` }]), what).toEqual([`${path}:2: reaches createToken outside the allowed files`]);
    // A computed key under a TypeScript assertion is the same key.
    for (const form of ['repo["createToken" as "createToken"]', 'repo[<"createToken">"createToken"]', 'repo["createToken"!]', 'repo[("createToken" satisfies string) as "createToken"]'])
      expect(violations([{ path, text: `declare const repo: any;\n${form}("read", 60);\n` }]), form).toEqual([`${path}:2: reaches createToken outside the allowed files`]);
    // Not parsed: this text is not TypeScript, and the scan would throw on it.
    expect(violations([{ path, text: "this is not a program {" }])).toEqual([]);
    expect(() => violations([{ path, text: "this is not a program { createToken" }])).toThrow();
  });

  it("the checker's namespace probe in a new production file fails", () => {
    const text = "import type { RepoHandle } from '@generalbusiness/artroom-git';\nexport namespace CheckerMintProbe {\n  export const issue = (repo: RepoHandle) => repo.createToken?.('read', 60);\n}\n";
    expect(violations([{ path: "packages/room/src/checker-mint-scan-probe.ts", text }])).toEqual(["packages/room/src/checker-mint-scan-probe.ts:3: reaches createToken outside the allowed files"]);
  });

  it("the same file at an allowed path fails on its count, and a reach put back into publisher/client.ts (the old fork token) fails", () => {
    const text = readFileSync(join(ROOT, "packages/room/test/node/fixtures/create-token-forms.ts"), "utf8");
    expect(violations([{ path: "packages/git/src/snapshot/repos.ts", text }])).toEqual(["packages/git/src/snapshot/repos.ts: 20 reaches of createToken, allowed 1"]);
    const client = readFileSync(join(ROOT, "packages/git/src/publisher/client.ts"), "utf8");
    const old = client + "\nasync function withForkToken(repo: RepoHandle) {\n  return repo.createToken(\"read\", TOKEN_TTL.pin);\n}\n";
    expect(violations([{ path: "packages/git/src/publisher/client.ts", text: old }])).toEqual([expect.stringMatching(/^packages\/git\/src\/publisher\/client\.ts:\d+: reaches createToken outside the allowed files$/)]);
  });
});
