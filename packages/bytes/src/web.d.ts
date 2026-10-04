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
