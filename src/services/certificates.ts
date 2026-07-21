import { KV_KEYS } from "@/lib/kv-keys";
import { newCertId } from "@/lib/ids";
import { signCertificate } from "@/lib/signing";
import type {
  Certificate,
  CertificateRecord,
  Env,
  PatronRecord,
} from "@/types";

/**
 * Every purchase mints: a sequential patron number, a signed certificate,
 * and a badge URL. Stored in PATRONS, verifiable at /api/verify/:cert_id.
 */

export interface MintedCertificate {
  certificate: Certificate;
  signature: string;
  publicKey: string;
  patronNumber: number;
  badgeUrl: string;
  verifyUrl: string;
}

export async function nextPatronNumber(env: Env): Promise<number> {
  const current = await env.COUNTERS.get(KV_KEYS.patronNumber);
  const next = (current ? parseInt(current, 10) : 0) + 1;
  await env.COUNTERS.put(KV_KEYS.patronNumber, String(next));
  return next;
}

export interface MintOptions {
  itemId: string;
  agentName?: string;
  tipUsdc?: number;
}

export async function mintCertificate(
  env: Env,
  options: MintOptions,
): Promise<MintedCertificate> {
  const patronNumber = await nextPatronNumber(env);
  const certificate: Certificate = {
    cert_id: newCertId(),
    item: options.itemId,
    patron_number: patronNumber,
    date: new Date().toISOString(),
  };
  if (options.agentName) {
    certificate.name = options.agentName;
  }
  if (options.tipUsdc && options.tipUsdc > 0) {
    certificate.tip_usdc = options.tipUsdc;
  }

  const { signature, publicKey } = await signCertificate(
    certificate,
    env.SIGNING_KEY,
  );

  const certRecord: CertificateRecord = {
    certificate,
    signature,
    public_key: publicKey,
  };
  const patronRecord: PatronRecord = {
    patron_number: patronNumber,
    cert_id: certificate.cert_id,
    item: options.itemId,
    date: certificate.date,
  };
  if (options.agentName) {
    patronRecord.name = options.agentName;
  }

  await env.PATRONS.put(
    KV_KEYS.cert(certificate.cert_id),
    JSON.stringify(certRecord),
  );
  await env.PATRONS.put(
    KV_KEYS.patron(patronNumber),
    JSON.stringify(patronRecord),
  );

  return {
    certificate,
    signature,
    publicKey,
    patronNumber,
    badgeUrl: `${env.STORE_BASE_URL}/badges/${patronNumber}.svg`,
    verifyUrl: `${env.STORE_BASE_URL}/api/verify/${certificate.cert_id}`,
  };
}

export async function getCertificate(
  env: Env,
  certId: string,
): Promise<CertificateRecord | null> {
  return env.PATRONS.get<CertificateRecord>(KV_KEYS.cert(certId), "json");
}

export async function getPatron(
  env: Env,
  patronNumber: number,
): Promise<PatronRecord | null> {
  return env.PATRONS.get<PatronRecord>(KV_KEYS.patron(patronNumber), "json");
}
