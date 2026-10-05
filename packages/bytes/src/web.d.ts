/**
 * The Web APIs this package uses. They exist in workerd, Node and browsers.
 * They are declared here, not through a DOM or Workers lib, so the package
 * states exactly what it relies on.
 */

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
  decode(input?: Uint8Array): string;
}

// The timer and the abort signal of a deadline (`take.ts`).

declare function setTimeout(run: () => void, ms: number): unknown;
declare function clearTimeout(timer: ReturnType<typeof setTimeout> | undefined): void;

declare class AbortController {
  readonly signal: { readonly aborted: boolean; addEventListener(type: "abort", listener: () => void): void; removeEventListener(type: "abort", listener: () => void): void };
  abort(): void;
}
