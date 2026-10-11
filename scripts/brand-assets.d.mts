/** Public interface of the owned JavaScript asset generator. */
export const MODULE: string;
export const PUBLIC_BRAND_FILES: Record<string, readonly [string, string]>;
export function brandAssets(): Promise<string>;
