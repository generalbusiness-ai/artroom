/**
 * The timer and the abort signal this package uses for the deadline of one
 * read. They exist in workerd, Node and browsers. They are declared here,
 * not through a DOM or Workers lib, so the package states exactly what it
 * relies on. The text coders are declared by the bytes package.
 */

declare function setTimeout(run: () => void, ms: number): unknown;
declare function clearTimeout(timer: ReturnType<typeof setTimeout> | undefined): void;

declare class AbortController {
  readonly signal: unknown;
  abort(): void;
}
