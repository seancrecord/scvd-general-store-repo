import { signMessage } from "@/lib/signing";
import {
  REPORT_BODY,
  REPORT_ID,
  REPORT_META,
} from "@/store/reports/x402-field-2026-08";
import type { Env } from "@/types";

/**
 * ECOSYSTEM RESEARCH REPORTS AS SIGNED ARTIFACTS (2026-08-19).
 *
 * A report is the store acting as what it claims to be — the neutral
 * observer — so it ships the way everything else here ships: signed,
 * free to verify, forever. FREE deliberately; the signature is the
 * product, and charging for the evidence would put a toll booth on
 * the one thing whose value is that anyone can check it.
 *
 * SIGNED AT SERVE, NOT AT BUILD, and that is safe on purpose: ed25519
 * is deterministic, so the same key over the same canonical bytes
 *  yields the same signature on every request — no stored artifact to
 * drift from its content, and a body edit visibly changes both digest
 * and signature. The canonical form is fixed-order JSON over the
 * fields below, same discipline as every other artifact class.
 */

export interface ReportArtifact {
  report_id: string;
  title: string;
  published: string;
  body_markdown: string;
  body_sha256: string;
  method_governed_by: string;
  evidence: string;
  bitcoin_anchor: string;
}

const REPORTS: Record<string, { meta: typeof REPORT_META; body: string }> = {
  [REPORT_ID]: { meta: REPORT_META, body: REPORT_BODY },
};

export function reportIds(): string[] {
  return Object.keys(REPORTS);
}

export function getReport(id: string): { meta: typeof REPORT_META; body: string } | null {
  return REPORTS[id] ?? null;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Fixed field order, nothing derived at hash time except the body
 * digest itself — a stranger holding the body can reproduce this
 * string byte for byte.
 */
export async function canonicalizeReport(id: string): Promise<string | null> {
  const report = getReport(id);
  if (!report) return null;
  return JSON.stringify({
    report_id: report.meta.id,
    title: report.meta.title,
    published: report.meta.published,
    body_sha256: await sha256Hex(report.body),
    method_governed_by: report.meta.method_governed_by,
    evidence: report.meta.evidence,
    bitcoin_anchor: report.meta.bitcoin_anchor,
  });
}

export async function signedReport(
  env: Env,
  id: string,
): Promise<Record<string, unknown> | null> {
  const report = getReport(id);
  const canonical = await canonicalizeReport(id);
  if (!report || !canonical) return null;
  const { signature, publicKey } = await signMessage(canonical, env.SIGNING_KEY);
  return {
    report_id: report.meta.id,
    title: report.meta.title,
    published: report.meta.published,
    body_markdown: report.body,
    body_sha256: await sha256Hex(report.body),
    method_governed_by: report.meta.method_governed_by,
    evidence: `https://github.com/seancrecord/scvd-general-store-repo/tree/main/${(report.meta.evidence.split(" ")[0] ?? "").replace(/\/$/, "")}`,
    bitcoin_anchor: report.meta.bitcoin_anchor,
    // The live OTS proof state (`ots`) is merged by the route from
    // services/report-anchors — OUTSIDE the signed payload, because a
    // payload carrying its own anchor's status would be orphaned by
    // every confirmation. The digest anchored is body_sha256, which
    // the signature already binds.
    price: "free, forever — the signature is the product",
    signature,
    public_key: publicKey,
    algorithm: "ed25519",
    signed_payload: canonical,
    signature_covers:
      "signed_payload is the exact UTF-8 string the signature covers: ed25519_verify(utf8(signed_payload), hex_to_bytes(signature), hex_to_bytes(public_key)). body_sha256 inside it binds the full markdown body served here; hash the body yourself and compare.",
    verify_url: `${env.STORE_BASE_URL}/api/verify/${report.meta.id}`,
  };
}
