/** Vite reads the checked-in Site fixture bytes without an alternate document in the test. */
declare module "*?raw" {
  const source: string;
  export default source;
}
