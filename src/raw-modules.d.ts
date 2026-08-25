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

/**
 * Markdown as a Text module. wrangler.jsonc declares the rule; esbuild
 * and the vitest pool both honour it, and TypeScript needs telling.
 */
declare module "*.md" {
  const contents: string;
  export default contents;
}

/**
 * `import.meta.glob` is Vite's, and the store's tsconfig deliberately
 * lists only the Workers type packages — pulling in "vite/client"
 * wholesale would hand the Worker source a pile of DOM-ish ambient
 * types it has no business seeing. The guard in test/doc-drift.spec.ts
 * needs exactly this one member, so exactly this one is declared.
 */
interface ImportMeta {
  glob(
    pattern: string,
    options: { query: string; import: string; eager: true },
  ): Record<string, string>;
}
