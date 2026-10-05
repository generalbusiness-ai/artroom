/**
 * The WebCrypto this package uses. It exists in workerd, Node and browsers.
 * It is declared here, not through a DOM or Workers lib, so the package
 * states exactly what it relies on. `intent.ts` names the three calls it
 * makes on `subtle`.
 */

declare const crypto: {
  getRandomValues<T extends Uint8Array>(array: T): T;
  subtle: unknown;
};
