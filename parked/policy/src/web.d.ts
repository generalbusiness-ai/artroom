/**
 * The two Web APIs this package uses. Both exist in workerd, Node and
 * browsers. They are declared here, rather than through a DOM or Workers
 * lib, so that the package states exactly what it relies on.
 */

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare var crypto: {
  readonly subtle: {
    digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer>;
  };
};
