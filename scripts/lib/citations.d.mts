/**
 * Types for the node copy of the citation reading, so the Worker
 * suite (test/citation-watch.spec.ts) can hold it to the TypeScript
 * copy in src/lib/citations.ts on one fixture.
 */
export interface Fetched {
  status?: number;
  text?: string;
  error?: string;
}
export interface Verdict {
  name: string;
  verdict: "cited" | "gone" | "silent" | "unreadable";
  reason?: string;
  citations: string[];
}
export function citationPatterns(base: string): RegExp[];
export function citationsOn(text: string, base: string): string[];
export function judge(system: { name: string; cites_at: string; since: string; base?: string }, fetched: Fetched | undefined): Verdict & { cites_at: string; since: string };
export function judgeProspect(prospect: { name: string; url: string; noted: string; base?: string }, fetched: Fetched | undefined): Verdict & { url: string; noted: string };
export function exitCodeFor(verdicts: Verdict[]): 0 | 1;
