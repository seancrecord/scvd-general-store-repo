export interface ForeignName { instrument: string; as: string; verify: string; falsified_by: string }
export interface DefectClass {
  id: string;
  title: string;
  asserts: string;
  costs: string;
  detectable: "unpaid" | "paid";
  our_signal: string | null;
  falsified_by: string;
  repair_hint: string;
  buyer_hint: string;
  also_known_as?: ForeignName[];
  sourced_by?: string;
  registered?: string;
}
export interface EvidenceLabel { id: string; title: string; asserts: string; does_not_assert: string; falsified_by: string; authored_by: string; registered: string }
export interface VocabularyChange { version: string; date: string; at_the_instigation_of: string; what_changed: string }
export const VOCABULARY_VERSION: string;
export const VOCABULARY_URL: string;
export const DEFECT_CLASSES: readonly DefectClass[];
export const EVIDENCE_LABELS: readonly EvidenceLabel[];
export const CHANGELOG: readonly VocabularyChange[];
export function defectClass(id: string): DefectClass | undefined;
export function defectsBySignal(signal: string): DefectClass[];
export function remediationFor(id: string): { operator: string; buyer: string; definition_url: string } | undefined;
export function byDetectability(): { unpaid: DefectClass[]; paid: DefectClass[] };
export interface FetchOptions { base?: string; fetch?: typeof fetch; timeoutMs?: number }
export function fetchLatest(options?: FetchOptions): Promise<Record<string, unknown>>;
export function isStale(options?: FetchOptions): Promise<{ stale: boolean; snapshot: string; live: string }>;
