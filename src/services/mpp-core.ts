import { UNPAID_READ_NOTE } from "@/lib/mpp-challenge";
import { MPP_CORE_DEFECT } from "@/store/defect-vocabulary";
import { jcsCanonicalize } from "@/lib/jcs";
import { coreChallenges, headerParts, type CoreChallenge } from "@/lib/mpp-core-challenge";
import { isRecord } from "@/types";

import { MPP_CORE_BATTERY, MPP_CORE_SPEC, MPP_CORE_HEADER_LIMIT, MPP_CORE_PROBLEMS, MPP_CORE_PROBLEM_PREFIX } from "@/lib/mpp-core-spec";
export { MPP_CORE_BATTERY, MPP_CORE_SPEC, MPP_CORE_HEADER_LIMIT, MPP_CORE_PROBLEMS } from "@/lib/mpp-core-spec";
const MAX_CHALLENGES = 64;
type State = "pass" | "fail" | "unmeasured" | "not_applicable";
export interface MppCoreCheck { name: string; state: State; detail: string; failed_challenges?: number[]; defect_class?: typeof MPP_CORE_DEFECT }
export interface MppCoreInput {
  status: number | null;
  headers: { get(name: string): string | null };
  url: string;
  now: Date;
  bodyText?: string;
  bodyOverLimit?: boolean;
}
export interface MppCoreBlock {
  battery: typeof MPP_CORE_BATTERY;
  spec: typeof MPP_CORE_SPEC;
  state: "read" | "absent" | "unmeasured";
  observed_at: string;
  challenges: { index: number; credential_header: "Authorization" | "Payment-Authorization" | null }[];
  checks: MppCoreCheck[];
  counts: Record<"checks" | State, number>;
  problem: { state: "read" | "absent" | "unmeasured" | "unreadable"; recognized: boolean | null; status_matches: boolean | null };
  gaps: string[];
}
const GAPS = [
  "This is the observable core subset under the cited draft, not general MPP conformance or payment readiness. The frozen mpp-v1/draft-00 reading, x402 verdict, census history and passport qualification retain their meaning.",
  "Method and intent registration, their request schemas, amounts, currencies and recipients are not verified by this core reader. The core draft's proposed registry is initially empty; a repository directory is not an IANA registration.",
  `Challenge binding, request-body digest binding, credential routing, replay protection, concurrency, settlement, delivery and payment preferences are unmeasured. No credential was submitted. ${UNPAID_READ_NOTE}`,
  "HTTPS is observable; the negotiated TLS version is not measured here. Expiry evaluation does not resolve leap seconds or the RFC 3339 unknown local offset. Deep JSON beyond this reader's validation limit remains unmeasured.",
  "No Payment version is carried on the wire. The cited draft identifies this reader's rules, not a version claimed by the endpoint. Problem Details are a SHOULD recommendation, reported separately from failed checks.",
];

function validUnicode(value: unknown, depth = 0): boolean | null {
  if (depth > 64) return null;
  const wellFormed = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const next = text.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      } else if (c >= 0xdc00 && c <= 0xdfff) return false;
    }
    return true;
  };
  if (typeof value === "string") return wellFormed(value);
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (!wellFormed(key)) return false;
      const valid = validUnicode(entry, depth + 1);
      if (valid !== true) return valid;
    }
  }
  return true;
}

function canonicalJson(raw: string | undefined, opaque: boolean): State {
  if (raw === undefined) return opaque ? "not_applicable" : "fail";
  // Request padding is explicitly prohibited. Opaque uses RFC 4648 base64url;
  // canonical padding, when present there, is not mistaken for bad JSON.
  if (!(opaque ? /^[A-Za-z0-9_-]+={0,2}$/ : /^[A-Za-z0-9_-]+$/).test(raw)) return "fail";
  try {
    const bytes = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const roundTrip = btoa(bytes).replace(/\+/g, "-").replace(/\//g, "_");
    if (raw !== roundTrip.replace(/=+$/, "") && !(opaque && raw === roundTrip)) return "fail";
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(bytes, c => c.charCodeAt(0)));
    const value: unknown = JSON.parse(text);
    if (opaque && (!isRecord(value) || Array.isArray(value) || Object.values(value).some(v => typeof v !== "string"))) return "fail";
    const unicode = validUnicode(value);
    if (unicode === null) return "unmeasured";
    if (!unicode) return "fail";
    return jcsCanonicalize(value) === text ? "pass" : "fail";
  } catch { return "fail"; }
}

function expiry(raw: string | undefined): { format: State; future: State; at?: number } {
  if (raw === undefined) return { format: "not_applicable", future: "not_applicable" };
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/);
  if (!match) return { format: "fail", future: "unmeasured" };
  const [, y, m, d, h, min, sec, zone] = match;
  const year = Number(y); const month = Number(m); const day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const zoneValid = zone!.toUpperCase() === "Z" || (Number(zone!.slice(1, 3)) <= 23 && Number(zone!.slice(4)) <= 59);
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]! || Number(h) > 23 || Number(min) > 59 || Number(sec) > 60 || !zoneValid) return { format: "fail", future: "unmeasured" };
  if (sec === "60") return { format: "unmeasured", future: "unmeasured" };
  if (zone === "-00:00") return { format: "pass", future: "unmeasured" };
  const at = Date.parse(raw);
  return Number.isFinite(at) ? { format: "pass", future: "pass", at } : { format: "unmeasured", future: "unmeasured" };
}

function problemOf(input: MppCoreInput): MppCoreBlock["problem"] {
  const empty = { recognized: null, status_matches: null };
  if (input.status === null || input.bodyOverLimit || input.bodyText === undefined) return { state: "unmeasured", ...empty };
  if ((input.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase() !== "application/problem+json") return { state: "absent", ...empty };
  try {
    const body: unknown = JSON.parse(input.bodyText);
    if (!isRecord(body) || Array.isArray(body) || typeof body.type !== "string") return { state: "unreadable", ...empty };
    const name = body.type.startsWith(MPP_CORE_PROBLEM_PREFIX) ? body.type.slice(MPP_CORE_PROBLEM_PREFIX.length) : "";
    const recognized = Object.hasOwn(MPP_CORE_PROBLEMS, name);
    return { state: "read", recognized, status_matches: recognized ? input.status === MPP_CORE_PROBLEMS[name] && (body.status === undefined || body.status === input.status) : null };
  } catch { return { state: "unreadable", ...empty }; }
}

/** Pure over the already captured response. No request, credential or method schema is inferred. */
export function readMppCore(input: MppCoreInput): MppCoreBlock {
  const base: MppCoreBlock = {
    battery: MPP_CORE_BATTERY, spec: MPP_CORE_SPEC, state: "unmeasured", observed_at: input.now.toISOString(),
    challenges: [], checks: [], counts: { checks: 0, pass: 0, fail: 0, unmeasured: 0, not_applicable: 0 },
    problem: problemOf(input), gaps: [...GAPS],
  };
  if (input.status === null) { base.gaps.push("No response was captured; absence of a challenge was not measured."); return base; }
  const raw = input.headers.get("www-authenticate") ?? "";
  if (new TextEncoder().encode(raw).byteLength > MPP_CORE_HEADER_LIMIT) {
    base.gaps.push(`The challenge header exceeded this reader's ${MPP_CORE_HEADER_LIMIT}-byte limit; no prefix was scored.`); return base;
  }
  const parsed = coreChallenges(raw);
  const challenges = parsed.challenges;
  if (challenges.length > MAX_CHALLENGES) { base.gaps.push(`More than ${MAX_CHALLENGES} Payment challenges; no alternatives were discarded to score a prefix.`); return base; }
  if (!challenges.length) { base.state = parsed.complete ? "absent" : "unmeasured"; return base; }
  base.state = "read";
  const add = (name: string, state: State, detail: string, failed?: number[]) => {
    base.checks.push({ name, state, detail, ...(failed?.length ? { failed_challenges: failed } : {}), ...(state === "fail" ? { defect_class: MPP_CORE_DEFECT } : {}) });
  };
  const each = (name: string, run: (challenge: CoreChallenge) => State, detail: string, needsSyntax = true) => {
    const states = challenges.map(c => needsSyntax && !c.syntax ? "unmeasured" : run(c));
    const failed = states.flatMap((state, i) => state === "fail" ? [i] : []);
    const state = failed.length ? "fail" : states.includes("unmeasured") ? "unmeasured" : states.includes("pass") ? "pass" : "not_applicable";
    add(name, state, detail, failed);
  };
  each("challenge-syntax", c => c.syntax ? "pass" : "fail", "RFC 9110 auth-params, unambiguous names, complete quoted strings; unknown values are not interpreted.", false);
  each("custom-parameter-names", c => c.custom_names_lowercase ? "pass" : "fail", "Custom parameter names are lowercase; valid unknown values are ignored.");
  each("challenge-id", c => c.params.id ? "pass" : "fail", "id is present and non-empty after unescaping.");
  each("challenge-realm", c => Object.hasOwn(c.params, "realm") ? "pass" : "fail", "realm is present; an empty protection-space value is not invented to be forbidden.");
  each("method-format", c => /^[a-z]+$/.test(c.params.method ?? "") ? "pass" : "fail", "Method identifiers contain lowercase ASCII letters only; this is not a registry lookup.");
  each("intent-format", c => /^[A-Za-z0-9-]+$/.test(c.params.intent ?? "") ? "pass" : "fail", "Intent identifiers match the collected ABNF; registration is separately unmeasured.");
  add("method-registration", "unmeasured", "No method registry or method-specific request schema was verified.");
  add("intent-registration", "unmeasured", "No live IANA registry lookup or method/intent specification validation was made.");
  each("request-jcs", c => canonicalJson(c.params.request, false), "Unpadded, canonical base64url of UTF-8 JCS JSON. Method-specific request structure is not judged.");
  each("opaque-jcs", c => canonicalJson(c.params.opaque, true), "When present, opaque is base64url of JCS JSON with a flat string-to-string map; its contents are not published.");
  each("credential-header", c => c.params.header === undefined || c.params.header === "Payment-Authorization" ? "pass" : "fail", "Only omission (Authorization) or the exact Payment-Authorization value is supported by draft-01.");
  each("expires-format", c => expiry(c.params.expires).format, "Optional expires follows RFC 3339 calendar and time syntax; leap-second validity remains unmeasured.");
  each("expires-future", c => { const e = expiry(c.params.expires); return e.at === undefined ? e.future : e.at > input.now.getTime() ? "pass" : "fail"; }, "Expiry is compared with the injected observation time, never a snapshot's later seal time.");
  let https = false;
  try { https = new URL(input.url).protocol === "https:"; } catch { /* A malformed target cannot establish TLS. */ }
  add("challenge-https", https ? "pass" : "fail", "The observed challenge URL uses HTTPS; negotiated TLS version is unmeasured.");
  add("challenge-status", input.status === 402 ? "pass" : "unmeasured", "HTTP 402 is observed. For another status, the hidden payment/error condition and its required status are not inferred.");
  const cache = headerParts(input.headers.get("cache-control") ?? "");
  add("challenge-no-store", input.status !== 402 ? "not_applicable" : !cache.complete ? "unmeasured" : cache.parts.some(p => /^no-store$/i.test(p.trim())) ? "pass" : "fail", "The 402 carries a no-store cache directive, outside quoted extension values.");
  add("error-receipt-absent", input.status < 400 ? "not_applicable" : input.headers.get("payment-receipt") === null ? "pass" : "fail", "Error responses must not carry Payment-Receipt; receipt bytes are not retained by this reading.");
  add("challenge-binding", "unmeasured", "An opaque id does not prove the server binds or verifies challenge parameters.");
  add("digest-binding", challenges.some(c => c.params.digest !== undefined) ? "unmeasured" : "not_applicable", "No request body or paid retry was submitted; digest syntax and binding are not verified.");
  base.challenges = challenges.map((c, index) => ({ index, credential_header: !c.syntax ? null : c.params.header === undefined ? "Authorization" : c.params.header === "Payment-Authorization" ? "Payment-Authorization" : null }));
  base.counts.checks = base.checks.length;
  for (const check of base.checks) base.counts[check.state]++;
  return base;
}
