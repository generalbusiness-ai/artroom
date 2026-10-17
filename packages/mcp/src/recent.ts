/** Internal continuation hints only, never results or authority. Eviction
 * restarts a bounded search; it never admits work or invents an answer. */
export const RECENT_ENTRIES = 64;

export class Recent<T> {
  readonly #values = new Map<string, T>();

  get(key: string): T | undefined {
    if (!this.#values.has(key)) return undefined;
    const value = this.#values.get(key)!;
    this.#values.delete(key);
    this.#values.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    this.#values.delete(key);
    this.#values.set(key, value);
    if (this.#values.size > RECENT_ENTRIES) this.#values.delete(this.#values.keys().next().value!);
  }

  delete(key: string): void { this.#values.delete(key); }
}
