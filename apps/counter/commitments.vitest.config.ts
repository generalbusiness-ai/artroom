import base from "./vitest.config.ts";

// Separate focused candidate selection; old C0/root selection is unchanged.
// Import/execution of this config remains held until the owner releases it.
export default { ...base, test: { ...base.test, include: ["commitments.test.ts"] } };
