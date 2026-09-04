export const DEFAULT_BASE: string;
export const BATTERY: string;
export const EXIT: Readonly<{ ok: 0; verdictNegative: 1; usage: 2; unreachable: 3 }>;
export const SEVERITY: readonly ["ready", "refused", "unreachable", "not_ready"];

export interface PreflightCheck { name: string; ok: boolean; detail: string }
export interface PreflightAdvisory { name: string; detail: string }
export interface RemediationRow {
  signal: string;
  kind: "check" | "advisory";
  defect_class: string;
  title?: string;
  detectable?: "unpaid" | "paid";
  definition_url: string;
  operator: string;
  buyer: string;
  falsified_by?: string;
}
export interface PreflightReport {
  version: string;
  verdict: "ready" | "not_ready" | "unreachable";
  checks: PreflightCheck[];
  advisories: PreflightAdvisory[];
  remediation?: RemediationRow[];
  single_probe_note?: string;
  what_this_cannot_tell_you?: string[];
  [key: string]: unknown;
}
export type Outcome = "ready" | "not_ready" | "unreachable" | "refused" | "store_unreachable";
export interface PreflightResult {
  url: string;
  outcome: Outcome;
  detail: string | null;
  status: number | null;
  body: PreflightReport | Record<string, unknown> | null;
  next_action?: string | null;
}
export interface PreflightOptions { base?: string; fetch?: typeof fetch; timeoutMs?: number }

export function preflightOne(url: string, options?: PreflightOptions): Promise<PreflightResult>;
export function preflightMany(urls: readonly string[], options?: PreflightOptions): Promise<PreflightResult[]>;
export function failedChecks(report: PreflightReport | null | undefined): string[];
export function remediation(report: PreflightReport | null | undefined): RemediationRow[];
export function exitCodeFor(results: readonly PreflightResult[], failOn?: Iterable<string>): 0 | 1 | 2 | 3;
export function worstOutcome(results: readonly PreflightResult[]): "ready" | "refused" | "unreachable" | "not_ready";
export function renderLines(result: PreflightResult): string[];
