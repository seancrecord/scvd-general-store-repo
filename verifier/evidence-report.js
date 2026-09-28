import { evidenceBytes, evidenceDigest } from "./evidence-bundle.js";
import { payToDigest } from "./payment-identity.js";

export const EVIDENCE_REPORT_FORMAT = "scvd-evidence-reading/v1";
export const CHALLENGE_HEADERS_MAX_BYTES = 65536;
export const EVIDENCE_REPORT_MAX_BYTES = 131072;
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const text = value => typeof value === "string" && value.length > 0 && value.length <= 2048 ? value : null;

/** Headers and their resource URL are unsigned claims, including when a
 * digest matches a signed row. Never select a payment rail or authorize it. */
export async function readPaymentChallenge(bytes, subject) {
  const result = {
    authenticated: false, source_sha256: await evidenceDigest(bytes),
    status: "missing_header", resource_url: null, subject_matches: null, offers: [],
    scope: "Unsigned saved response headers. A resource URL is a claim, not proof of response origin. Address-digest matches concern only the selected signed observations; not matching terms, address validity, issuer authority, current readiness or permission to pay.",
  };
  // curl may retain redirects, informational responses or a proxy handshake.
  // Inspect the final response, never pick a convenient earlier challenge.
  const blocks = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim().split(/\r?\n\r?\n/);
  const lines = blocks.at(-1).split(/\r?\n/);
  if (!/^HTTP\/(?:1\.[01]|2(?:\.0)?|3(?:\.0)?)\s+402(?:\s|$)/.test(lines[0])) return { ...result, status: "not_a_402_response" };
  const headers = lines.slice(1).filter(line => /^payment-required\s*:/i.test(line));
  if (headers.length !== 1) return { ...result, status: headers.length ? "ambiguous_header" : "missing_header" };
  let challenge;
  try {
    const encoded = headers[0].slice(headers[0].indexOf(":") + 1).trim();
    challenge = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(evidenceBytes(encoded, CHALLENGE_HEADERS_MAX_BYTES)));
  } catch { return { ...result, status: "malformed_challenge" }; }
  if (challenge?.x402Version !== 2 || !Array.isArray(challenge.accepts) || !challenge.accepts.length || challenge.accepts.length > 64) return { ...result, status: "unsupported_challenge" };
  result.resource_url = text(challenge.resource?.url);
  result.subject_matches = result.resource_url === null ? null : result.resource_url === subject.url;
  const observations = subject.status === "present" && result.subject_matches ? subject.observations : [];
  const digests = observation => observation.value?.offer?.pay_to_digest;
  const comparable = observations.length > 0 && subject.omitted_observations === 0 && observations.every(row => Array.isArray(digests(row)) && digests(row).length > 0 && digests(row).every(hash));
  result.status = "read";
  for (const [index, offer] of challenge.accepts.entries()) {
    const row = { index, scheme: text(offer?.scheme), network: text(offer?.network), asset: text(offer?.asset), amount: text(offer?.amount), pay_to: text(offer?.payTo), address_digest: null, matched_signed_observations: [], comparison: "unavailable" };
    if ([row.scheme, row.network, row.asset, row.amount, row.pay_to].some(value => (value === null || !value.trim()))) result.status = "read_with_gaps";
    if (row.pay_to !== null && row.pay_to.trim()) {
      row.address_digest = await payToDigest(row.pay_to);
      row.matched_signed_observations = observations.filter(observation => Array.isArray(digests(observation)) && digests(observation).some(digest => hash(digest) && digest.toLowerCase() === row.address_digest)).map(observation => observation.signed_claims_pointer);
      row.comparison = row.matched_signed_observations.length ? "matched" : comparable ? "not_matched" : "unavailable";
    }
    result.offers.push(row);
  }
  return result;
}

export function renderEvidenceReport(result, maxBytes = EVIDENCE_REPORT_MAX_BYTES) {
  // Every untrusted string stays inside one JSON line. JSON escapes line
  // breaks; escape JS line separators too, so neither fences nor HTML from
  // issuer claims can become Markdown structure. Never interpolate them into
  // the surrounding prose. The compact record preserves the bounded rows.
  const data = JSON.stringify(result).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const report = `# Evidence verification report\n\nCorpus snapshots verified in this command: ${result.corpus_snapshots_verified}. This is not a count of weekly history or proof of current delivery. Unsigned history is not authenticated by this check.\n\nOriginal-file SHA-256 and signed-message SHA-256 identify different bytes. The exact computed fields are below; retain and cite this report without retyping identifiers. Keep the original response, source URL and independently established key: this report cannot be verified alone.\n\n\`\`\`json\n${data}\n\`\`\`\n\nSignature validity does not establish issuer identity, truthful observations, current payment terms, settlement, delivery, Bitcoin anchoring or permission to spend. Observation dates remain separate from snapshot publication and any caller freshness policy.\n`;
  if (new TextEncoder().encode(report).length > Math.min(maxBytes, EVIDENCE_REPORT_MAX_BYTES)) throw new Error("report_too_large");
  return report;
}
