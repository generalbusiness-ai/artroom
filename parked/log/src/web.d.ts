/**
 * The Web APIs the runtime-neutral modules use. They exist in workerd, Node
 * and browsers; they are declared here rather than through a DOM or Workers
 * lib so the package states exactly what it relies on.
 */

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean });
  decode(input?: Uint8Array): string;
}

/** Used by the policy package, which `verify` runs to replay decisions. */
declare var crypto: {
  readonly subtle: {
    digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer>;
  };
};
