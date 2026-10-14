import { evidenceBytes, evidenceDigest } from "./evidence-bundle.js";
import { payToDigest } from "./payment-identity.js";

export const EVIDENCE_REPORT_FORMAT = "scvd-evidence-reading/v1";
export const CHALLENGE_HEADERS_MAX_BYTES = 65536;
export const EVIDENCE_REPORT_MAX_BYTES = 131072;
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const text = value => typeof value === "string" && value.length > 0 && value.length <= 2048 ? value : null;

// Reader commentary stays beside, never inside, the signed row. These meanings
// follow the preflight battery's declared scope; an absent field is not an
// experiment on the merchant's retry behavior.
const retryAbsent = {
  observed: "The recorded advisory says the declared inputs contained no recognized retry-key field.",
  unknown: "Whether retries are protected through a header, session, settlement identity or an unrecognized field; whether another authorization would double-charge. No paid retry was tested by this advisory.",
};
const offersAbsent = {
  observed: "The recorded advisory says no signed offer was found in the challenge placements the probe read.",
  unknown: "Whether signed offers exist elsewhere or appear under another request condition; this does not establish endpoint-wide absence.",
};
const advisoryMeanings = new Map([
  ["retry-key-not-in-challenge", retryAbsent],
  ["retry-key-declared", {
    observed: "The recorded advisory says a declared input has a recognized retry-key shape.",
    unknown: "Whether the merchant honors that field or safely handles retries; a declaration is not a paid retry test.",
  }],
  ["signed-offers-not-in-challenge", offersAbsent],
  ["no-signed-offers", offersAbsent], // Historical code, same bounded reading.
]);
const ADVISORY_READINGS_MAX_BYTES = 16384;

export function readAdvisoryScope(subject) {
  const reading = {
    basis: "reader_interpretation_of_signed_codes",
    scope: "Derived reader commentary, not additional signed claims or independently tested behavior. Codes come only from retained exact-subject signed rows. Unknown or omitted advisories do not imply a clean result.",
    status: subject.status, omitted_observations: subject.omitted_observations,
    observations: [], omitted_advisories: 0, max_bytes: ADVISORY_READINGS_MAX_BYTES,
  };
  // Bound the expansion from terse codes as well as the original row excerpt.
  // Omission counts survive; neither JSON nor Markdown silently loses scope.
  let bytes = 2;
  for (const observation of subject.observations) {
    const codes = observation.value?.advisories;
    if (!Array.isArray(codes)) continue;
    const row = { signed_claims_pointer: observation.signed_claims_pointer, advisories: [] };
    const baseBytes = new TextEncoder().encode(JSON.stringify(row)).length + 1;
    if (bytes + baseBytes > ADVISORY_READINGS_MAX_BYTES) { reading.omitted_advisories += codes.length; continue; }
    bytes += baseBytes;
    for (const value of codes) {
      const code = typeof value === "string" ? value : null;
      const item = { code, ...(advisoryMeanings.get(code) ?? {
        observed: null, unknown: "This code is not interpreted by this reader. Consult the original battery definition; neither safety nor absence of a safeguard is established.",
      }) };
      const size = new TextEncoder().encode(JSON.stringify(item)).length + 1;
      if (bytes + size > ADVISORY_READINGS_MAX_BYTES) { reading.omitted_advisories++; continue; }
      bytes += size;
      row.advisories.push(item);
    }
    reading.observations.push(row);
  }
  return reading;
}

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
  const report = `# Evidence verification report\n\nCorpus snapshots verified in this command: ${result.corpus_snapshots_verified}. This is not a count of weekly history or proof of current delivery. Unsigned history is not authenticated by this check.\n\nInput-file SHA-256 and signed-message SHA-256 identify different bytes. ${result.input_kind === "evidence_bundle" ? "The input hash identifies bundle bytes, not the original HTTP response. Bundle context is unsigned and not authenticated." : "The input hash identifies the saved response bytes."} The exact computed fields are below; retain and cite this report without retyping identifiers. Keep the input file (saved response or exported bundle), source URL and independently established key: this report cannot be verified alone.\n\n\`\`\`json\n${data}\n\`\`\`\n\nSignature validity does not establish issuer identity, truthful observations, current payment terms, settlement, delivery, Bitcoin anchoring or permission to spend. Observation dates remain separate from snapshot publication and any caller freshness policy.\n`;
  if (new TextEncoder().encode(report).length > Math.min(maxBytes, EVIDENCE_REPORT_MAX_BYTES)) throw new Error("report_too_large");
  return report;
}

// This is deliberately a lexical guard, not a parser of the agent's claims.
// Recompute references in verify-source; never trust a buyer-supplied report
// as the reference set, and never replace the draft to make this check pass.
export async function checkDraftIdentifiers(bytes, references, verified) {
  const draft = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const reading = {
    format: "scvd-draft-identifiers/v1", draft_sha256: await evidenceDigest(bytes),
    status: "no_candidates", prose_verified: false, candidates: 0, matched: 0,
    unrecognized: 0, unchecked: 0, omitted: 0, readings: [],
    scope: "Lexical comparison only: whole ASCII hexadecimal tokens of at least 48 digits, optionally prefixed 0x, against identifiers computed or used by this verification. Matching does not check labels, roles, negation, dates, interpretation, issuer identity or prose correctness. Short, split and non-hexadecimal identifiers are outside coverage. Unrecognized means absent from this reference set, not necessarily false. Inspect the saved draft; no text was rewritten. This check applies only to the draft bytes named by draft_sha256, not a later final answer.",
  };
  const known = new Map();
  for (const [field, value] of Object.entries(references)) {
    if (typeof value !== "string" || !/^[a-f0-9]{48,128}$/i.test(value)) continue;
    const key = value.toLowerCase();
    known.set(key, [...(known.get(key) ?? []), field]);
  }
  for (const match of draft.matchAll(/(?:^|[^A-Za-z0-9_])((?:0x)?[a-f0-9]{48,})(?![A-Za-z0-9_])/gi)) {
    const token = match[1], value = token.replace(/^0x/i, "").toLowerCase();
    const fields = verified ? known.get(value) ?? [] : [];
    const status = !verified ? "unchecked" : fields.length ? "matched" : "unrecognized";
    reading.candidates++; reading[status]++;
    // Scan every token even when display is full: omitted text cannot hide a
    // mismatch behind a successful early prefix. Never print huge tokens.
    if (reading.readings.length < 32) reading.readings.push({ value: value.length <= 128 ? token : null, length: value.length, status, reference_fields: fields.slice(0, 4), omitted_reference_fields: Math.max(0, fields.length - 4) });
    else reading.omitted++;
  }
  reading.status = !verified ? "verification_failed" : !reading.candidates ? "no_candidates" : reading.unrecognized ? "needs_review" : "all_candidates_recognized";
  return reading;
}
