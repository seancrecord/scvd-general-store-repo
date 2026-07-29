/**
 * Raw text imports. Vite serves `?raw` at build time; TypeScript needs
 * telling. Used by the skill-bundle tests to walk the PUBLISHED
 * document rather than the generated one — the generated document
 * cannot drift and the published one is where the drift was.
 */
declare module "*?raw" {
  const contents: string;
  export default contents;
}
