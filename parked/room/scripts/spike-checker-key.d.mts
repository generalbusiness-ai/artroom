// Types for spike-checker-key.mjs, which test/node/checks.cases.ts imports.

export declare const SEED_VAR: string;
export function envValue(text: string, name: string): string | null;
export function seedKeyPair(seed: unknown): { readonly key: string; readonly seed: Uint8Array } | null;
export function checkerJwk(seed: string): { readonly kty: "OKP"; readonly crv: "Ed25519"; readonly x: string; readonly d: string };
