/** Public production assets; building returns bytes without writing or enrolling a device. */
export type CountingAssetName = "index.html" | "counting.js" | "counting.css";
export type CountingFiles = Record<CountingAssetName, string>;
export const MODULE: string;
export const OUTPUT: string;
export function countingFiles(): Promise<CountingFiles>;
export function countingAssets(): Promise<string>;
