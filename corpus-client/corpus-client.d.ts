export const DEFAULT_BASE: string;
export const DOORS: Readonly<{
  corpus: string;
  fresh_set: string;
  host: (host: string) => string;
  month: (month?: string) => string;
  feeds: string;
  diff: string;
  defects: string;
}>;
export interface ClientOptions { base?: string; fetch?: typeof fetch; timeoutMs?: number }
export class CorpusHttpError extends Error { status: number; body: unknown }
export function corpus(options?: ClientOptions): Promise<Record<string, unknown>>;
export function freshSet(options?: ClientOptions): Promise<Record<string, unknown>>;
export function hostHistory(host: string, options?: ClientOptions): Promise<Record<string, unknown>>;
export function month(which?: string, options?: ClientOptions): Promise<Record<string, unknown>>;
export function feeds(options?: ClientOptions): Promise<Record<string, unknown>>;
export function diff(options?: ClientOptions): Promise<Record<string, unknown>>;
export function defects(options?: ClientOptions): Promise<Record<string, unknown>>;
export function withDenominator(count: number, of: number, noun: string): string;
