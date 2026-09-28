/** Shared wire reader and inspection exit policy. No probing, scoring or payment code. */
export const INSPECTION_VERSION = "inspection-v1";
export const INSPECTION_TERM_LIMIT = 32;

const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const strings = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
const natural = (v) => Number.isSafeInteger(v) && v >= 0;
const terms = (v, allowNumbers = false) => record(v) && ["read", "unobserved"].includes(v.state)
  && Array.isArray(v.entries) && v.entries.every((e) => record(e)
    && Object.values(e).every((x) => x === null || typeof x === "string" || (allowNumbers && typeof x === "number" && Number.isFinite(x))))
  && natural(v.total) && natural(v.omitted) && v.entries.length + v.omitted === v.total;
const checks = (v) => record(v) && typeof v.battery === "string"
  && natural(v.checked) && strings(v.failed) && v.failed.length <= v.checked;

/** Old or unfamiliar reports remain unavailable; never invent an observation from a verdict. */
export function inspectionOf(report) {
  const r = record(report) ? report.inspection : null;
  if (!record(r) || r.version !== INSPECTION_VERSION
    || typeof r.subject_url !== "string" || typeof r.observed_at !== "string" || !Number.isFinite(Date.parse(r.observed_at))
    || !record(r.reachability) || !["responded", "unreachable", "method_unresolved"].includes(r.reachability.state)
    || !(r.reachability.http_status === null || (Number.isInteger(r.reachability.http_status) && r.reachability.http_status >= 100 && r.reachability.http_status <= 599))
    || !(r.reachability.method === null || typeof r.reachability.method === "string")
    || !record(r.protocols) || !["read", "partial", "unobserved"].includes(r.protocols.state)
    || !strings(r.protocols.observed) || r.protocols.observed.some((p) => p !== "x402" && p !== "mpp")
    || new Set(r.protocols.observed).size !== r.protocols.observed.length || typeof r.protocols.scope !== "string"
    || !record(r.terms) || r.terms.trust !== "unverified_advertisement" || typeof r.terms.scope !== "string"
    || r.terms.limit_per_protocol !== INSPECTION_TERM_LIMIT || !terms(r.terms.x402) || !terms(r.terms.mpp, true)
    || [r.terms.x402, r.terms.mpp].some((t) => t.entries.length > INSPECTION_TERM_LIMIT)
    || !record(r.structure) || !checks(r.structure.x402) || typeof r.structure.x402.verdict !== "string"
    || !checks(r.structure.mpp) || !checks(r.structure.mpp_core) || !strings(r.structure.mpp_core.unmeasured)
    || !["read", "absent", "unmeasured"].includes(r.structure.mpp_core.state)
    || !record(r.coverage) || !["read", "over_limit", "unobserved"].includes(r.coverage.body)
    || !["read", "absent", "unmeasured"].includes(r.coverage.mpp_core)
    || !record(r.signatures) || r.signatures.state !== "not_checked" || typeof r.signatures.reason !== "string"
    || !strings(r.unperformed) || !strings(r.gaps)) return null;
  if (r.reachability.state === "responded" && (r.reachability.http_status === null || r.reachability.method === null || r.protocols.state === "unobserved")) return null;
  if (r.reachability.state !== "responded" && (r.protocols.state !== "unobserved" || r.protocols.observed.length)) return null;
  return r;
}

/** Exit zero means a response was inspected, never that payment is safe or ready. */
export function inspectionExitCodeFor({ status, body }) {
  if (status === null || status === 429 || status >= 500) return 3;
  if (status !== 200) return 2;
  return inspectionOf(body)?.reachability.state === "responded" ? 0 : 3;
}

export function renderInspectionLines(result) {
  const r = inspectionOf(result.body);
  if (!r) return ["Inspection unavailable: no supported observation was returned. No endpoint conclusion follows."];
  // These values came from a stranger's response. Quote controls instead of letting a terminal execute them.
  const q = (v) => JSON.stringify(v);
  const lines = [
    `${q(r.subject_url)}: ${r.reachability.state} at ${q(r.observed_at)}`,
    `  response: ${r.reachability.http_status ?? "unobserved"}; method: ${q(r.reachability.method)}`,
    `  protocols (${r.protocols.state}): ${r.protocols.observed.join(", ") || "none observed"}`,
    `  scope: ${q(r.protocols.scope)}`,
    `  x402 verdict (${q(r.structure.x402.battery)}): ${q(r.structure.x402.verdict)}`,
  ];
  for (const protocol of ["x402", "mpp"]) {
    const t = r.terms[protocol];
    lines.push(`  ${protocol} advertised terms (${t.state}, unverified): ${t.entries.length}/${t.total} shown; ${t.omitted} omitted`);
    for (const entry of t.entries) lines.push(`    ${q(entry)}`);
  }
  lines.push(`  terms scope: ${q(r.terms.scope)}`);
  // Additive fields may belong to a later reader. Only render the blocks validated above.
  for (const name of ["x402", "mpp", "mpp_core"]) {
    const s = r.structure[name];
    lines.push(`  ${name} structure (${q(s.battery)}): ${s.failed.length}/${s.checked} failed; ${q(s.failed)}`);
    if (s.unmeasured) lines.push(`    unmeasured: ${q(s.unmeasured)}`);
  }
  lines.push(`  body: ${r.coverage.body}; MPP core: ${r.coverage.mpp_core}`,
    `  signatures: ${r.signatures.state}; ${q(r.signatures.reason)}`,
    `  not performed: ${q(r.unperformed)}`);
  for (const gap of r.gaps) lines.push(`  gap: ${q(gap)}`);
  return lines;
}
