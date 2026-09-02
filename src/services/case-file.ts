import { BASE_EVM, POLYGON_EVM, getBlockTimestamp } from "@/lib/base-rpc";
import { signJcs } from "@/lib/jcs";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { houseWallets } from "@/lib/channel";
import { signMessage } from "@/lib/signing";
import { isSolanaSignature } from "@/lib/solana-rpc";
import { observeSettlement, type SignedAttestation } from "@/services/attestation";
import { getCertificate } from "@/services/certificates";
import type { ConformancePass, ConformanceWatchRecord } from "@/services/conformance-watch";
import { getLaunchCheck, type LaunchCheckRecord } from "@/services/launch-check";
import { getMandate, type MandateRecord } from "@/services/mandates";
import { effectiveObservation } from "@/services/passport";
import { deriveTier, tierInputFromHistory, type TierReading } from "@/services/passport-tier";
import {
  reconcileSettlement,
  type SignedReconciliation,
} from "@/services/settlement-reconciliation";
import type { StandingWatchRecord, WatchProbe } from "@/services/standing-watch";
import type { SubjectRound } from "@/services/subject-history";
import type { Env } from "@/types";

/**
 * THE CASE FILE — roadmap N8, the keeper's prompt verbatim in
 * docs/PROMPTS_2026-09-02.md §2.
 *
 * One URL, one signed artifact, holding everything this store already
 * observed about a single agent purchase, assembled for the human who
 * has to decide what went wrong. Neither party controls it. It binds
 * seven sections, each present or absent by name: the settlement, the
 * reconciliation (EVM), the mandate if one is cited, the door over the
 * seven days around the transaction (corpus rounds, watch rows, the
 * passport tier at the time), delivery (a launch check the buyer
 * supplies, or this store's own certificate against the same
 * settlement), the buyer's declared claim verbatim, and the gaps —
 * every absent section with its reason, counted against us.
 *
 * NO VERDICT. The case file says what was observed and what was not.
 * It never says who was wronged; that sentence is on the artifact.
 *
 * THE CONFLICT LINE. If the recipient is one of this store's own
 * declared wallets, or the door's host is this store, the artifact
 * prints "this store is a party to this purchase" on its face and
 * links /rights and /fulfillment-log. It does not refuse: a buyer
 * disputing us gets the same instrument, and the name on it.
 *
 * COMPOSED, NOT REBUILT. Every observed section is the artifact the
 * shelf already sells, produced by the same function: the attestation
 * by observeSettlement, the reconciliation by reconcileSettlement,
 * the tier by deriveTier over the same rows the passport uses. The
 * one thing that did not exist before this file is the lookup of
 * watch rows by host and window, which lives here.
 *
 * DECLARED NEVER TOUCHES OBSERVED. The buyer's claim, the expected
 * amount, and any payer or recipient they name ride the artifact
 * labelled declared, beside what was seen. The chain is asked about
 * the hash alone, so no declared input can colour an observed field;
 * a test assembles the same purchase with and without them and holds
 * the observed sections equal.
 */

export const CASE_FILE_CLAIM_CAP = 1000;
export const CASE_FILE_DOOR_WINDOW_DAYS = 7;
/** Same tx and same mandate inside a day is the same case file. */
export const CASE_FILE_IDEMPOTENT_SECONDS = 24 * 3600;
const WATCH_SCAN_CAP = 500;

export const NO_VERDICT =
  "This case file says what this store observed and what it did not. It never says who was in the wrong, who bears the blame, or what anyone is owed: those are decisions for the person holding it, and the file is built so they can make one from evidence rather than from either party's word.";

export interface CaseFileInput {
  txHash: string;
  mandateId?: string;
  /** The endpoint the purchase was made at, if the buyer names it. */
  endpointUrl?: string;
  payer?: string;
  recipient?: string;
  expectedAmountUsdc?: number;
  /** Stored verbatim, marked declared, never checked. */
  claim?: string;
  /** A launch check the buyer holds about the same door. */
  launchCheckId?: string;
}

/** Every section says whether it is there, and why not when it is not. */
export type Presence =
  | { present: true }
  | { present: false; reason: string };

export interface SettlementSection {
  presence: Presence;
  attestation?: SignedAttestation;
}

export interface ReconciliationSection {
  presence: Presence;
  reconciliation?: SignedReconciliation;
}

export interface MandateSection {
  presence: Presence;
  mandate?: MandateRecord["mandate"];
  /** Side by side, never enforced: what was declared, what settled. */
  declared_cap_usdc?: number | null;
  settled_usdc?: number | null;
  /** Arithmetic only, from the two numbers above. */
  settled_within_declared_cap?: boolean | null;
}

export interface WatchRowInWindow {
  kind: "standing_watch" | "conformance_watch";
  watch_id: string;
  url: string;
  at: string;
  verdict: string;
  failed: string[];
  history_url: string;
}

export interface DoorSection {
  presence: Presence;
  host?: string;
  window?: { from: string; to: string };
  /** Corpus rounds inside the window, exactly as the per-host history serves them. */
  rounds?: SubjectRound[];
  /** Rows from any watch running on this host inside the window. */
  watch_rows?: WatchRowInWindow[];
  watch_scan_truncated?: boolean;
  /** The tier derived over the rounds dated at or before the transaction. */
  tier_at_the_time?: TierReading;
  history_url?: string;
}

export interface DeliverySection {
  presence: Presence;
  /** A launch check the buyer supplied, read from this store's own records. */
  launch_check?: LaunchCheckRecord;
  /** This store's own certificate minted against the same settlement, when we were the seller. */
  our_certificate?: {
    cert_id: string;
    item: string;
    date: string;
    verify_url: string;
  };
}

export interface CaseFileObservation {
  artifact: "case_file";
  case_id: string;
  assembled_at: string;
  /** What was asked, echoed so the file cannot be re-pointed later. */
  query: {
    tx_hash: string;
    chain: string;
    mandate_id: string | null;
    endpoint_url: string | null;
    launch_check_id: string | null;
  };
  /** The buyer's inputs that are claims, labelled as such. */
  declared: {
    claim: string | null;
    expected_amount_usdc: number | null;
    payer: string | null;
    recipient: string | null;
    note: string;
  };
  settlement: SettlementSection;
  reconciliation: ReconciliationSection;
  mandate: MandateSection;
  door: DoorSection;
  delivery: DeliverySection;
  /** Every absent section with its reason. Counted against this store. */
  gaps: Array<{ section: string; reason: string }>;
  /** Printed whenever this store is a party. Absent otherwise. */
  conflict?: {
    this_store_is_a_party: true;
    because: string;
    rights_url: string;
    fulfillment_log_url: string;
  };
  no_verdict: string;
  scope: string;
  evidence_hash: string;
}

export interface SignedCaseFile extends CaseFileObservation {
  signature: string;
  public_key: string;
  signature_covers: string;
  signature_jcs: string;
  signature_jcs_covers: string;
}

export interface CaseFileRecord {
  case: SignedCaseFile;
  cert_id: string;
  created_at: string;
}

const SCOPE =
  "Everything this store already held or could read about one purchase, assembled at one moment and signed as a whole. Each section is the artifact the shelf sells on its own, produced by the same function, so a section here reads exactly as it would bought alone. What the store never observed is stated as absent with its reason, never inferred. Declared inputs narrow what is asked and never change what was answered. Not a dispute resolution, not a delivery verification where none was observed, and never a verdict on either party.";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newCaseId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `case_${[...bytes].map((b) => b.toString(36)).join("").slice(0, 12)}`;
}

/** The chain, from the identifier's own shape: the attestation's rule. */
export function chainOfHash(txHash: string): "evm" | "solana" {
  return isSolanaSignature(txHash) ? "solana" : "evm";
}

/** The idempotency key: same tx and same mandate is the same case. */
export async function caseFileQueryDigest(txHash: string, mandateId: string | undefined): Promise<string> {
  return sha256Hex(`${txHash.toLowerCase()}|${mandateId ?? ""}`);
}

/**
 * WATCH ROWS BY HOST AND WINDOW — the one lookup the prompt expected
 * not to exist, and it did not. Both watch kinds share the scan the
 * claims door already does for a payer; here the filter is the URL's
 * host and the row's timestamp. Truncation is reported, never hidden.
 */
export async function watchRowsForHost(
  env: Env,
  host: string,
  from: string,
  to: string,
  base: string,
): Promise<{ rows: WatchRowInWindow[]; truncated: boolean }> {
  const wanted = host.toLowerCase();
  const rows: WatchRowInWindow[] = [];
  let truncated = false;
  const standing = await listKeys(env.ORDERS, { prefix: KV_KEYS.standingWatchPrefix, cap: WATCH_SCAN_CAP });
  truncated ||= standing.truncated;
  const standingRecords = await bulkGetJson<StandingWatchRecord>(env.ORDERS, standing.names);
  for (const record of standingRecords.values()) {
    if (!record?.watch_id || hostOf(record.url) !== wanted) continue;
    for (const probe of record.probes as WatchProbe[]) {
      if (probe.at < from || probe.at > to) continue;
      rows.push({
        kind: "standing_watch",
        watch_id: record.watch_id,
        url: record.url,
        at: probe.at,
        verdict: probe.verdict,
        failed: probe.failed ?? [],
        history_url: `${base}/api/watch/${record.watch_id}`,
      });
    }
  }
  const conformance = await listKeys(env.ORDERS, { prefix: KV_KEYS.conformanceWatchPrefix, cap: WATCH_SCAN_CAP });
  truncated ||= conformance.truncated;
  const conformanceRecords = await bulkGetJson<ConformanceWatchRecord>(env.ORDERS, conformance.names);
  for (const record of conformanceRecords.values()) {
    if (!record?.watch_id || hostOf(record.url) !== wanted) continue;
    for (const pass of record.passes as ConformancePass[]) {
      if (pass.at < from || pass.at > to) continue;
      rows.push({
        kind: "conformance_watch",
        watch_id: record.watch_id,
        url: record.url,
        at: pass.at,
        verdict: pass.verdict,
        failed: pass.failed ?? [],
        history_url: `${base}/api/conformance-watch/${record.watch_id}`,
      });
    }
  }
  rows.sort((a, b) => a.at.localeCompare(b.at));
  return { rows, truncated };
}

function hostOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

function ourWallets(env: Env): Set<string> {
  const set = new Set<string>(houseWallets(env).map((w) => w.toLowerCase()));
  for (const value of [env.PAY_TO_ADDRESS, env.SOLANA_PAY_TO, env.POLYGON_PAY_TO]) {
    if (value) set.add(value.toLowerCase());
  }
  return set;
}

/**
 * The assembly. Every section is tried; every failure to observe is
 * a stated absence, never a thrown purchase — except the settlement
 * read itself, which is the one thing the file is about: if the
 * chain cannot be read, nothing is sold.
 */
export async function performCaseFile(
  env: Env,
  input: CaseFileInput,
  now: Date = new Date(),
): Promise<SignedCaseFile> {
  const base = env.STORE_BASE_URL;
  const chain = chainOfHash(input.txHash);
  const gaps: CaseFileObservation["gaps"] = [];

  // 1. settlement — a fresh attestation on the tx, the shelf's own.
  /* The chain is asked about the hash alone. The buyer's payer,
   * recipient and expected amount would narrow the read and colour the
   * status, which is a declared input touching an observed field; they
   * ride the artifact under `declared` instead, beside what was seen. */
  const attestation = await observeSettlement(env, { txHash: input.txHash }, now);
  const settlement: SettlementSection = { presence: { present: true }, attestation };

  // 2. reconciliation — EVM only, by the same rule the item sells under.
  let reconciliation: ReconciliationSection;
  if (chain === "evm") {
    try {
      const observed = await reconcileSettlement(env, { txHash: input.txHash }, now);
      reconciliation = { presence: { present: true }, reconciliation: observed };
    } catch (error) {
      const reason = `the reconciliation read failed: ${error instanceof Error ? error.message : String(error)}`;
      reconciliation = { presence: { present: false, reason } };
      gaps.push({ section: "reconciliation", reason });
    }
  } else {
    const reason = "the reconciliation desk reads EVM receipts only; this transaction is on Solana, where the EIP-3009 ceiling it reconciles does not exist";
    reconciliation = { presence: { present: false, reason } };
    gaps.push({ section: "reconciliation", reason });
  }

  // 3. mandate — if cited: declared cap beside settled amount, never enforced.
  let mandate: MandateSection;
  if (input.mandateId) {
    const record = await getMandate(env, input.mandateId);
    if (record) {
      const declaredCap = record.mandate.declared_cap_usdc ?? null;
      const settled = attestation.amount_usdc;
      mandate = {
        presence: { present: true },
        mandate: record.mandate,
        declared_cap_usdc: declaredCap,
        settled_usdc: settled,
        settled_within_declared_cap:
          declaredCap === null || settled === null ? null : settled <= declaredCap,
      };
    } else {
      const reason = `no mandate under ${input.mandateId} in this store's records`;
      mandate = { presence: { present: false, reason } };
      gaps.push({ section: "mandate", reason });
    }
  } else {
    const reason = "no mandate_id was given; nothing was cited";
    mandate = { presence: { present: false, reason } };
    gaps.push({ section: "mandate", reason });
  }

  // 4. door — corpus rounds, watch rows and the tier at the time, over the week around the tx.
  let door: DoorSection;
  const host = hostOf(input.endpointUrl);
  if (!host) {
    const reason = "no endpoint url was given, so there is no door to look up";
    door = { presence: { present: false, reason } };
    gaps.push({ section: "door", reason });
  } else {
    /* Centred on the block's own time when the chain gives one, else on
     * the read. A file centred on the moment somebody asked would put
     * an old purchase's door outside its own window. */
    const mined =
      chain === "evm" && attestation.block_height !== null
        ? await getBlockTimestamp(
            env,
            attestation.block_height,
            attestation.chain.toLowerCase().includes("polygon") ? POLYGON_EVM : BASE_EVM,
          )
        : null;
    const centre = mined ?? now;
    const half = (CASE_FILE_DOOR_WINDOW_DAYS / 2) * 86_400_000;
    const from = new Date(centre.getTime() - half).toISOString();
    const to = new Date(centre.getTime() + half).toISOString();
    const observation = await effectiveObservation(env, host, now);
    const rounds = observation.history.timeline.filter(
      (round) => round.taken_at >= from && round.taken_at <= to,
    );
    const watches = await watchRowsForHost(env, host, from, to, base);
    if (observation.never_observed && watches.rows.length === 0) {
      const reason = `not_observed: this store never observed ${host} — an answer about our books, not about the door`;
      door = {
        presence: { present: false, reason },
        host,
        window: { from, to },
        rounds: [],
        watch_rows: [],
        watch_scan_truncated: watches.truncated,
        history_url: `${base}/corpus/host/${host}.json`,
      };
      gaps.push({ section: "door", reason });
    } else {
      const upToNow = {
        ...observation.history,
        timeline: observation.history.timeline.filter((round) => round.taken_at <= to),
      };
      door = {
        presence: { present: true },
        host,
        window: { from, to },
        rounds,
        watch_rows: watches.rows,
        watch_scan_truncated: watches.truncated,
        tier_at_the_time: deriveTier(tierInputFromHistory(upToNow, observation), `${base}/criteria`),
        history_url: `${base}/corpus/host/${host}.json`,
      };
    }
  }

  // 5. delivery — a launch check the buyer holds, or our own certificate against this settlement.
  let delivery: DeliverySection = { presence: { present: false, reason: "" } };
  const launch = input.launchCheckId ? await getLaunchCheck(env, input.launchCheckId) : null;
  const ourCertId = await env.PATRONS.get(KV_KEYS.settlementCert(input.txHash.toLowerCase()));
  const ourCert = ourCertId ? await getCertificate(env, ourCertId) : null;
  if (launch || ourCert) {
    delivery = {
      presence: { present: true },
      ...(launch ? { launch_check: launch } : {}),
      ...(ourCert
        ? {
            our_certificate: {
              cert_id: ourCert.certificate.cert_id,
              item: ourCert.certificate.item,
              date: ourCert.certificate.date,
              verify_url: `${base}/api/verify/${ourCert.certificate.cert_id}`,
            },
          }
        : {}),
    };
    if (input.launchCheckId && !launch) {
      gaps.push({ section: "delivery.launch_check", reason: `no launch check under ${input.launchCheckId} in this store's records` });
    }
  } else {
    const reason = input.launchCheckId
      ? `delivery not observed by this store: no launch check under ${input.launchCheckId}, and no certificate of ours names this settlement`
      : "delivery not observed by this store. This is the section a dispute usually turns on, and this store usually does not have it: nothing here saw what the seller sent after the money moved.";
    delivery = { presence: { present: false, reason } };
    gaps.push({ section: "delivery", reason });
  }

  // The conflict line: our wallets, or our door.
  const wallets = ourWallets(env);
  const ownHost = new URL(base).host.toLowerCase();
  const recipientSeen = attestation.recipient?.toLowerCase() ?? null;
  const recipientDeclared = input.recipient?.toLowerCase() ?? null;
  const partyBecause: string[] = [];
  if (recipientSeen && wallets.has(recipientSeen)) partyBecause.push(`the settlement's recipient ${attestation.recipient} is one of this store's declared wallets`);
  if (recipientDeclared && wallets.has(recipientDeclared) && !(recipientSeen && wallets.has(recipientSeen))) partyBecause.push(`the declared recipient is one of this store's declared wallets`);
  if (host && host === ownHost) partyBecause.push(`the door named is this store's own host`);
  if (ourCert) partyBecause.push(`this store minted a certificate against this settlement, so it was the seller`);

  const observation: Omit<CaseFileObservation, "evidence_hash"> = {
    artifact: "case_file",
    case_id: newCaseId(),
    assembled_at: now.toISOString(),
    query: {
      tx_hash: input.txHash,
      chain,
      mandate_id: input.mandateId ?? null,
      endpoint_url: input.endpointUrl ?? null,
      launch_check_id: input.launchCheckId ?? null,
    },
    declared: {
      claim: input.claim ?? null,
      expected_amount_usdc: input.expectedAmountUsdc ?? null,
      payer: input.payer ?? null,
      recipient: input.recipient ?? null,
      note: "The buyer's own inputs, stored verbatim and marked declared. Never checked, and never allowed to change what the chain or this store's records answered.",
    },
    settlement,
    reconciliation,
    mandate,
    door,
    delivery,
    gaps,
    ...(partyBecause.length > 0
      ? {
          conflict: {
            this_store_is_a_party: true as const,
            because: `this store is a party to this purchase: ${partyBecause.join("; ")}`,
            rights_url: `${base}/rights`,
            fulfillment_log_url: `${base}/fulfillment-log`,
          },
        }
      : {}),
    no_verdict: NO_VERDICT,
    scope: SCOPE,
  };
  const evidenceHash = await sha256Hex(JSON.stringify(observation));
  const full: CaseFileObservation = { ...observation, evidence_hash: evidenceHash };
  const signedPayload = JSON.stringify(full);
  const { signature, publicKey } = await signMessage(signedPayload, env.SIGNING_KEY);
  return {
    ...full,
    signature,
    public_key: publicKey,
    signature_covers:
      "ed25519 over the JSON serialization of every field above `signature`, in the order served.",
    signature_jcs: await signJcs(full as unknown as Record<string, unknown>, env.SIGNING_KEY),
    signature_jcs_covers:
      "RFC 8785 canonicalization of the same fields — jcs(observation) -> utf8 -> ed25519_verify with the same public_key.",
  };
}

export async function storeCaseFile(
  env: Env,
  signed: SignedCaseFile,
  certId: string,
  input: CaseFileInput,
): Promise<CaseFileRecord> {
  const record: CaseFileRecord = {
    case: signed,
    cert_id: certId,
    created_at: new Date().toISOString(),
  };
  await kvPut(env.PATRONS, KV_KEYS.caseFile(signed.case_id), JSON.stringify(record));
  await kvPut(
    env.PATRONS,
    KV_KEYS.caseFileQuery(await caseFileQueryDigest(input.txHash, input.mandateId)),
    signed.case_id,
    { expirationTtl: CASE_FILE_IDEMPOTENT_SECONDS },
  );
  return record;
}

export async function getCaseFile(env: Env, caseId: string): Promise<CaseFileRecord | null> {
  return kvGetJson<CaseFileRecord>(env.PATRONS, KV_KEYS.caseFile(caseId), "json");
}

/** The case already assembled for this tx and mandate inside a day, if any. */
export async function existingCaseFor(
  env: Env,
  txHash: string,
  mandateId: string | undefined,
): Promise<CaseFileRecord | null> {
  const caseId = await env.PATRONS.get(KV_KEYS.caseFileQuery(await caseFileQueryDigest(txHash, mandateId)));
  return caseId ? getCaseFile(env, caseId) : null;
}

/** The words a verdict would use, kept off every field by a test. */
export const FORBIDDEN_VERDICT_WORDS = ["fault", "wronged", "liable"] as const;

/** One line for the purchase response. */
export function caseFileNote(signed: SignedCaseFile): string {
  const present = ["settlement", "reconciliation", "mandate", "door", "delivery"].filter(
    (section) => (signed[section as keyof SignedCaseFile] as { presence: Presence }).presence.present,
  );
  const absent = signed.gaps.length;
  return `The case file is assembled: ${present.length} section${present.length === 1 ? "" : "s"} observed (${present.join(", ")}), ${absent} absent with ${absent === 1 ? "its reason" : "their reasons"} stated and counted against us.${signed.conflict ? " This store is a party to this purchase, and the file says so on its face." : ""} It says what was observed and what was not; it never says who was in the wrong.`;
}
