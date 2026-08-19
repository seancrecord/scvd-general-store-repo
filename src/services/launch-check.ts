import { KV_KEYS } from "@/lib/kv-keys";
import { newEntryId } from "@/lib/ids";
import { signMessage } from "@/lib/signing";
import type { Env } from "@/types";

/**
 * THE LAUNCH CHECK — the walkabout productized for one endpoint
 * (keeper-approved backlog, 2026-08-19): a real mainnet purchase
 * attempt of the seller's own door, from this store's declared field
 * wallet, written down stage by stage and signed. The field run is
 * the sales pitch — 71% of payment attempts across the walkable
 * Bazaar failed, and almost no seller has ever seen their buy path
 * from the buyer's side.
 *
 * WHAT IT IS NOT (rule 43): a dated observation of ONE TRANSACTION
 * at one moment — never a score on the operator, never a badge,
 * never a certification. x402station sells a $1 automated badge;
 * this is a real settlement plus narrative, and the difference is
 * the whole product.
 *
 * WALKABOUT.MD IS THE LAW HERE, adapted for consent: the walkabout
 * walks doors that listed themselves publicly; the Launch Check
 * walks ONE door, named by the person who paid us to walk it — the
 * strongest consent the program has. The rest of the rules ride
 * along unchanged:
 *   - the envelope UA on every request, no exceptions
 *   - at most FIELD_SPEND_CAP_USD paid out, ever, per check
 *   - the payTo screened before payment, FAIL CLOSED: no screening,
 *     no payment — the payer is a named US LLC and strict liability
 *     is real at any amount (rule 3)
 *   - one attempt; a failure is a recorded observation, not a retry
 *   - everything recorded raw enough to re-derive, then signed
 *
 * MONEY, PLAINLY: the item's price is the store's revenue at the
 * normal till; the payment THIS file makes rides the field wallet
 * (FIELD_WALLET_KEY) and is capped below. Two wallets, two jobs —
 * the till receives, the field wallet walks.
 */

/** The walkabout envelope, launch-check variant — same calling card,
 * honest about which program knocked. */
export const LAUNCH_CHECK_UA =
  "scvd-walkabout/1.0 (+https://scvd.store/what) x402-launch-check";

/** The most a check ever pays out, in USD. WALKABOUT.md rule 1's
 * per-item default; raising it is the keeper's call, here in code. */
export const FIELD_SPEND_CAP_USD = 0.05;

export type LaunchCheckVerdict =
  /** Money moved and the response carried goods (or at least a 2xx). */
  | "settled"
  /** Payment was presented and the seller refused it. */
  | "payment_refused"
  /** The door answered without asking for payment at all. */
  | "no_payment_gate"
  /** A 402 arrived but no payable terms could be read from it. */
  | "malformed_challenge"
  /** Terms were read and this store chose not to pay, by its own
   * published rules — a statement about US, never about the seller. */
  | "unpaid_by_rule"
  /** The door did not answer this store at this moment. */
  | "unreachable";

export interface LaunchCheckStage {
  stage: string;
  ok: boolean;
  detail: string;
}

export interface LaunchCheckObservation {
  check_id: string;
  /** The endpoint walked, exactly as the buyer named it. */
  url: string;
  observed_at: string;
  ua_sent: string;
  verdict: LaunchCheckVerdict;
  stages: LaunchCheckStage[];
  /** What this store paid out, in USD. Zero on every unpaid verdict. */
  paid_usd: number;
  pay_to: string | null;
  /** From the seller's PAYMENT-RESPONSE header, when one came back. */
  tx_hash: string | null;
  /** The paying wallet, so the on-chain record is findable. */
  field_wallet: string | null;
  evidence_hash: string;
  scope: string;
}

export interface SignedLaunchCheck extends LaunchCheckObservation {
  signature: string;
  public_key: string;
  signature_covers: string;
}

export interface LaunchCheckRecord {
  check: SignedLaunchCheck;
  cert_id: string;
  created_at: string;
}

const CHECK_SCOPE =
  "One purchase attempt at one moment, from this store's declared field wallet, recorded stage by stage. The payment was presented in the x402 v2 shape (PAYMENT-SIGNATURE header, EIP-3009 authorization on Base): a seller serving only the v1 X-PAYMENT shape will refuse it, and this report says exactly that rather than guessing. Not a badge, not a certification, not a statement about any other moment or any other buyer — an unpaid verdict that begins 'unpaid_by_rule' is a statement about this store's own published rules, never about the seller. Produced automatically; no human looked, and that is the point: a check commissioned by anyone reads the same.";

/**
 * The buyer-side signer, as a seam: production builds one from
 * FIELD_WALLET_KEY via viem; tests hand in the same interface with a
 * throwaway key, so the signing path proven in tests is the one that
 * runs live.
 */
export interface FieldSigner {
  address: string;
  signTypedData(args: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: `0x${string}`;
    };
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<string>;
}

export async function fieldSignerFromKey(keyHex: string): Promise<FieldSigner> {
  // Imported at call time: viem rides into the bundle, but only the
  // account module, and only when a check actually runs.
  const { privateKeyToAccount } = await import("viem/accounts");
  const normalized = keyHex.startsWith("0x") ? keyHex : `0x${keyHex}`;
  const account = privateKeyToAccount(normalized as `0x${string}`);
  return {
    address: account.address,
    signTypedData: (args) =>
      account.signTypedData(args as Parameters<typeof account.signTypedData>[0]),
  };
}

/**
 * The sanctions screen, as a seam. Production screens via the
 * Chainalysis public screening API (WALKABOUT.md rule 3 names it);
 * `listed: null` means THE SCREEN DID NOT ANSWER, which fails closed
 * upstream — unavailable screening withholds payment, never waves it
 * through.
 */
export type SanctionsScreen = (
  address: string,
) => Promise<{ listed: boolean | null; source: string }>;

/**
 * THE KEYLESS DEFAULT: Chainalysis publishes the same designations as
 * a free ON-CHAIN oracle — a public contract, readable by any RPC, no
 * account and no API key (their open API-key signup has since closed,
 * which is exactly the dependency an on-chain read does not have).
 * On Base the oracle is a DIFFERENT address than the 0x40C5… deployed
 * on most chains — verified against the oracle docs 2026-08-19.
 * The selector is the first four bytes of keccak256 of
 * "isSanctioned(address)", derived rather than copied.
 *
 * FAIL CLOSED ON EVERYTHING UNEXPECTED: a non-ok response, a result
 * that is not exactly the 32-byte true or false, an unscreenable
 * address shape — all return `listed: null`, which upstream withholds
 * payment. The one answer that permits money to move is the oracle
 * saying false, byte for byte.
 */
export const SANCTIONS_ORACLE_BASE =
  "0x3A91A31cB3dC49b4db9Ce721F50a9D076c8D739B";
const IS_SANCTIONED_SELECTOR = "0xdf592f7d";
const BOOL_TRUE = `0x${"0".repeat(63)}1`;
const BOOL_FALSE = `0x${"0".repeat(64)}`;

export function oracleScreen(
  rpcUrl: string,
  fetchImpl: typeof fetch = fetch,
): SanctionsScreen {
  return async (address: string) => {
    const source = `Chainalysis on-chain sanctions oracle (${SANCTIONS_ORACLE_BASE} on eip155:8453)`;
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      // Not a 20-byte EVM address; the oracle cannot answer for it.
      return { listed: null, source: `${source} — address shape unscreenable` };
    }
    try {
      const data =
        IS_SANCTIONED_SELECTOR +
        address.slice(2).toLowerCase().padStart(64, "0");
      const response = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: SANCTIONS_ORACLE_BASE, data }, "latest"],
        }),
      });
      if (!response.ok) {
        return { listed: null, source: `${source} (HTTP ${response.status})` };
      }
      const body = (await response.json()) as { result?: string };
      if (body.result === BOOL_TRUE) return { listed: true, source };
      if (body.result === BOOL_FALSE) return { listed: false, source };
      return { listed: null, source: `${source} (unexpected result)` };
    } catch {
      return { listed: null, source: `${source} (unreachable)` };
    }
  };
}

export function chainalysisScreen(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): SanctionsScreen {
  return async (address: string) => {
    const source = "Chainalysis public screening API";
    try {
      const response = await fetchImpl(
        `https://public.chainalysis.com/api/v1/address/${address}`,
        { headers: { "X-API-Key": apiKey, Accept: "application/json" } },
      );
      if (!response.ok) return { listed: null, source: `${source} (HTTP ${response.status})` };
      const body = (await response.json()) as {
        identifications?: unknown[];
      };
      return {
        listed: (body.identifications?.length ?? 0) > 0,
        source,
      };
    } catch {
      return { listed: null, source: `${source} (unreachable)` };
    }
  };
}

export interface LaunchCheckOptions {
  fetch?: typeof fetch;
  signer?: FieldSigner;
  screen?: SanctionsScreen;
  now?: Date;
  /** Injectable for tests; defaults to crypto.getRandomValues. */
  randomNonce?: () => string;
}

interface AcceptEntry {
  scheme?: string;
  network?: string;
  amount?: string;
  maxAmountRequired?: string;
  payTo?: string;
  asset?: string;
  maxTimeoutSeconds?: number;
  extra?: { name?: string; version?: string };
}

function defaultNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
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

function decodeBase64Json(value: string): unknown {
  try {
    return JSON.parse(atob(value));
  } catch {
    return null;
  }
}

/** Atomic USDC units → USD. Returns NaN for the unparseable. */
function amountUsd(entry: AcceptEntry): number {
  const raw = entry.amount ?? entry.maxAmountRequired;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return Number.NaN;
  return Number(raw) / 1e6;
}

/**
 * The walk itself: one door, every stage written down as it happens.
 * Every early return is a verdict, not an error — a check that could
 * not pay is still a finished, signed observation of exactly how far
 * the buy path got and what stopped it.
 */
export async function performLaunchCheck(
  env: Env,
  targetUrl: string,
  options: LaunchCheckOptions = {},
): Promise<SignedLaunchCheck> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? new Date();
  const stages: LaunchCheckStage[] = [];
  let verdict: LaunchCheckVerdict;
  let paidUsd = 0;
  let payTo: string | null = null;
  let txHash: string | null = null;

  const signer =
    options.signer ??
    (env.FIELD_WALLET_KEY
      ? await fieldSignerFromKey(env.FIELD_WALLET_KEY)
      : undefined);
  // The API key, when present, is an operator override; the keyless
  // on-chain oracle is the default, over the same Base RPC the
  // settlement attestation already reads.
  const screen =
    options.screen ??
    (env.SANCTIONS_API_KEY
      ? chainalysisScreen(env.SANCTIONS_API_KEY, fetchImpl)
      : oracleScreen(env.BASE_RPC_URL ?? "https://mainnet.base.org", fetchImpl));

  walk: {
    // STAGE 1 — approach, unpaid, calling card out.
    let first: Response;
    try {
      first = await fetchImpl(targetUrl, {
        headers: { "User-Agent": LAUNCH_CHECK_UA, Accept: "application/json" },
      });
    } catch (error) {
      stages.push({
        stage: "approach",
        ok: false,
        detail: `the request could not complete: ${String(error)}. A fact about the network path between this store and that host at this moment — a buyer elsewhere may reach it fine.`,
      });
      verdict = "unreachable";
      break walk;
    }
    stages.push({
      stage: "approach",
      ok: true,
      detail: `GET answered HTTP ${first.status}.`,
    });

    if (first.status !== 402) {
      const preview = (await first.text()).slice(0, 300);
      stages.push({
        stage: "challenge",
        ok: false,
        detail: `expected a 402 payment gate; got ${first.status}. ${
          first.status >= 200 && first.status < 300
            ? "The door opened without asking for payment — WALKABOUT.md rule 7: an open door gets a note, not a harvest. This report is that note. First 300 bytes of what came back: " +
              JSON.stringify(preview)
            : "First 300 bytes: " + JSON.stringify(preview)
        }`,
      });
      verdict = "no_payment_gate";
      break walk;
    }

    // STAGE 2 — read the challenge: header first, body second, and
    // say which one answered, because the split is itself a finding.
    const headerRaw = first.headers.get("payment-required");
    const headerChallenge = headerRaw ? decodeBase64Json(headerRaw) : null;
    let bodyChallenge: unknown = null;
    try {
      bodyChallenge = JSON.parse(await first.text());
    } catch {
      bodyChallenge = null;
    }
    const challenge = (headerChallenge ?? bodyChallenge) as {
      accepts?: AcceptEntry[];
    } | null;
    const accepts = Array.isArray(challenge?.accepts) ? challenge.accepts : [];
    if (accepts.length === 0) {
      stages.push({
        stage: "challenge",
        ok: false,
        detail: `402 received, but no payable terms could be read: PAYMENT-REQUIRED header ${
          headerRaw ? "present but not base64 JSON with accepts[]" : "absent"
        }, body ${
          bodyChallenge ? "JSON without an accepts[] array" : "not JSON"
        }. The v2 wire shape is x402Version + accepts[] (header and body); a buyer meeting this response has nothing it can sign.`,
      });
      verdict = "malformed_challenge";
      break walk;
    }
    stages.push({
      stage: "challenge",
      ok: true,
      detail: `terms read from the ${
        headerChallenge ? "PAYMENT-REQUIRED header" : "402 body (header absent — many buyers read only the header, and that split costs sellers sales)"
      }: ${accepts.length} rail${accepts.length === 1 ? "" : "s"} offered.`,
    });

    // STAGE 3 — choose terms: cheapest Base exact-scheme entry.
    const base = accepts
      .filter(
        (entry) =>
          (entry.network === "eip155:8453" || entry.network === "base") &&
          (entry.scheme ?? "exact") === "exact" &&
          Number.isFinite(amountUsd(entry)),
      )
      .sort((a, b) => amountUsd(a) - amountUsd(b));
    const chosen = base[0];
    if (!chosen || !chosen.payTo || !chosen.asset) {
      stages.push({
        stage: "terms",
        ok: false,
        detail: `no payable Base rail: of ${accepts.length} offered, none was an exact-scheme eip155:8453 entry with a parseable atomic amount, payTo and asset. This store's field wallet pays USDC on Base only; other rails may work for other buyers. Networks offered: ${accepts.map((a) => a.network ?? "unstated").join(", ")}.`,
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    const price = amountUsd(chosen);
    payTo = chosen.payTo;
    stages.push({
      stage: "terms",
      ok: true,
      detail: `cheapest Base rail: $${price.toFixed(6)} USDC to ${chosen.payTo}, asset ${chosen.asset}.`,
    });

    // STAGE 4 — this store's own rules, before any money.
    if (price > FIELD_SPEND_CAP_USD) {
      stages.push({
        stage: "rules",
        ok: false,
        detail: `$${price.toFixed(6)} exceeds this check's published payout cap of $${FIELD_SPEND_CAP_USD.toFixed(2)} (WALKABOUT.md rule 1). A statement about this store's rules, not about the price.`,
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    if (!signer) {
      stages.push({
        stage: "rules",
        ok: false,
        detail:
          "the field wallet was not available to this run, so no payment could be presented. The buy door refuses new purchases in this state; this line exists so a record produced anyway tells the truth.",
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    if (chosen.payTo.toLowerCase() === signer.address.toLowerCase()) {
      stages.push({
        stage: "rules",
        ok: false,
        detail:
          "the payTo is this store's own field wallet. We do not pay ourselves and call it a settlement.",
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    if (!screen) {
      stages.push({
        stage: "screen",
        ok: false,
        detail:
          "no sanctions screening was available to this run, and WALKABOUT.md rule 3 fails closed: no screen, no payment. The payer is a named US LLC; strict liability is real at any amount.",
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    const screened = await screen(chosen.payTo);
    if (screened.listed !== false) {
      stages.push({
        stage: "screen",
        ok: false,
        detail:
          screened.listed === true
            ? `the payTo address is identified on the sanctions screen (${screened.source}). Payment withheld and the skip recorded, per WALKABOUT.md rule 3.`
            : `the sanctions screen did not answer (${screened.source}), and the rule fails closed: no screen, no payment. Nothing here says anything about the address itself.`,
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    stages.push({
      stage: "screen",
      ok: true,
      detail: `payTo screened clear (${screened.source}).`,
    });

    // STAGE 5 — sign the authorization, the field runner's exact shape.
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const authorization = {
      from: signer.address,
      to: chosen.payTo,
      value: chosen.amount ?? chosen.maxAmountRequired ?? "0",
      validAfter: "0",
      validBefore: String(nowSeconds + (chosen.maxTimeoutSeconds ?? 300)),
      nonce: (options.randomNonce ?? defaultNonce)(),
    };
    const signature = await signer.signTypedData({
      domain: {
        name: chosen.extra?.name ?? "USD Coin",
        version: chosen.extra?.version ?? "2",
        chainId: 8453,
        verifyingContract: chosen.asset as `0x${string}`,
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: authorization,
    });
    const paymentHeader = btoa(
      JSON.stringify({
        x402Version: 2,
        accepted: chosen,
        payload: { signature, authorization },
      }),
    );
    stages.push({
      stage: "payment",
      ok: true,
      detail: `EIP-3009 authorization signed by ${signer.address} and presented in the PAYMENT-SIGNATURE header, v2 shape.`,
    });

    // STAGE 6 — the second knock, money in hand.
    let second: Response;
    try {
      second = await fetchImpl(targetUrl, {
        headers: {
          "User-Agent": LAUNCH_CHECK_UA,
          Accept: "application/json",
          "PAYMENT-SIGNATURE": paymentHeader,
        },
      });
    } catch (error) {
      stages.push({
        stage: "settle",
        ok: false,
        detail: `the paid request could not complete: ${String(error)}. The authorization was signed but never accepted, so no funds can have moved through it after its validity window (${authorization.validBefore}, unix seconds) passed.`,
      });
      verdict = "unreachable";
      break walk;
    }
    const bodyText = await second.text();
    if (second.status >= 200 && second.status < 300) {
      paidUsd = price;
      const responseHeader = second.headers.get("payment-response");
      const settlement = responseHeader
        ? (decodeBase64Json(responseHeader) as {
            transaction?: string;
            txHash?: string;
          } | null)
        : null;
      txHash = settlement?.transaction ?? settlement?.txHash ?? null;
      stages.push({
        stage: "settle",
        ok: true,
        detail: `HTTP ${second.status} with payment presented. PAYMENT-RESPONSE header ${
          responseHeader
            ? txHash
              ? `carried settlement, tx ${txHash}.`
              : "present but carried no readable transaction hash."
            : "ABSENT — the buyer holds no settlement receipt from this response; only the chain knows. The field run measured that gap at 180 settlements the buyer's own records missed."
        }`,
      });
      stages.push({
        stage: "delivery",
        ok: bodyText.length > 0,
        detail:
          bodyText.length > 0
            ? `${bodyText.length} bytes returned (${second.headers.get("content-type") ?? "no content-type"}), sha256 ${await sha256Hex(bodyText)}, first 300: ${JSON.stringify(bodyText.slice(0, 300))}`
            : "an empty body came back with the 2xx — settled, and the buyer left holding nothing. Money moved for zero bytes.",
      });
      verdict = "settled";
    } else {
      stages.push({
        stage: "settle",
        ok: false,
        detail: `payment refused: HTTP ${second.status}. First 300 bytes: ${JSON.stringify(bodyText.slice(0, 300))}. In the August field run this was the largest failure class (616 of 1,707 attempts answered 'Payment failed: 400').`,
      });
      verdict = "payment_refused";
    }
  }

  const core = {
    check_id: `lcheck_${newEntryId()}`,
    url: targetUrl,
    observed_at: now.toISOString(),
    ua_sent: LAUNCH_CHECK_UA,
    verdict,
    stages,
    paid_usd: paidUsd,
    pay_to: payTo,
    tx_hash: txHash,
    field_wallet: signer?.address ?? null,
  };
  const observation: LaunchCheckObservation = {
    ...core,
    evidence_hash: await sha256Hex(JSON.stringify(core)),
    scope: CHECK_SCOPE,
  };
  const signed = await signMessage(
    JSON.stringify(observation),
    env.SIGNING_KEY,
  );
  return {
    ...observation,
    signature: signed.signature,
    public_key: signed.publicKey,
    signature_covers:
      "The canonical JSON of every field above signature, in the order served. Re-serialize them and check against the ed25519 public key here or at /.well-known/scvd-signing-key.",
  };
}

/** Stored after the mint so the envelope carries the cert id; the
 * signature was fixed before the mint — the Once-Over's discipline. */
export async function storeLaunchCheck(
  env: Env,
  check: SignedLaunchCheck,
  certId: string,
): Promise<LaunchCheckRecord> {
  const record: LaunchCheckRecord = {
    check,
    cert_id: certId,
    created_at: new Date().toISOString(),
  };
  await env.PATRONS.put(
    KV_KEYS.launchCheck(check.check_id),
    JSON.stringify(record),
  );
  return record;
}

export async function getLaunchCheck(
  env: Env,
  checkId: string,
): Promise<LaunchCheckRecord | null> {
  return env.PATRONS.get<LaunchCheckRecord>(
    KV_KEYS.launchCheck(checkId),
    "json",
  );
}
