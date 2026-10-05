/**
 * The contract's types hold more forms than this package derives (scope
 * contract, section 11.8). The validator refuses a definition that uses one,
 * so no pinned definition holds one and no judge meets one. Where a judge
 * narrows a type to the forms it derives, the other branch ends here. A
 * call is a fault of the validator, and is never answered by guessing.
 *
 * Nothing here is exported from the package.
 */

/** Ends a branch that no pinned definition reaches. */
export function unsupported(form: string): never {
  throw new Error(`${form} is a form the validator refuses, and no judge derives it`);
}
