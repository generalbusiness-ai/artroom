/** A text file imported whole, as the test runner's `?raw` suffix gives it. */
declare module "*.md?raw" {
  const text: string;
  export default text;
}
