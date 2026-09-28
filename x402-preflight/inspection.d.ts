export const INSPECTION_VERSION: "inspection-v1";
export const INSPECTION_TERM_LIMIT: number;
export interface InspectionTerms<T> {
  state: "read" | "unobserved";
  entries: T[];
  total: number;
  omitted: number;
}
export interface EndpointInspection {
  version: typeof INSPECTION_VERSION;
  subject_url: string;
  observed_at: string;
  reachability: {
    state: "responded" | "unreachable" | "method_unresolved";
    http_status: number | null;
    method: string | null;
  };
  protocols: {
    state: "read" | "partial" | "unobserved";
    observed: ("x402" | "mpp")[];
    scope: string;
  };
  terms: {
    trust: "unverified_advertisement";
    scope: string;
    limit_per_protocol: number;
    x402: InspectionTerms<Record<string, string | null>>;
    mpp: InspectionTerms<Record<string, string | number | null>>;
  };
  structure: {
    x402: { battery: string; verdict: string; checked: number; failed: string[] };
    mpp: { battery: string; checked: number; failed: string[] };
    mpp_core: { battery: string; state: string; checked: number; failed: string[]; unmeasured: string[] };
  };
  coverage: { body: "read" | "over_limit" | "unobserved"; mpp_core: "read" | "absent" | "unmeasured" };
  signatures: { state: "not_checked"; reason: string };
  unperformed: string[];
  gaps: string[];
}
export interface InspectionResponse { status: number | null; body: unknown }
export function inspectionOf(report: unknown): EndpointInspection | null;
export function inspectionExitCodeFor(result: InspectionResponse): 0 | 2 | 3;
export function renderInspectionLines(result: InspectionResponse): string[];
