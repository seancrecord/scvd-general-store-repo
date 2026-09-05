import type { FieldSigner, SanctionsScreen } from "@/services/launch-check";
import { MAX_AUTHORIZATION_SECONDS } from "@/services/launch-check-terms";

/**
 * ONE PAID GET, THE FIELD RUNNER'S SHAPE, AS A LIBRARY (2026-09-04).
 *
 * The launch check has bought from a stranger's door since 2026-08-19,
 * stage by stage, with every refusal it makes written down: it will
 * not pay itself, will not pay an unscreened address, will not pay
 * over the house cap, and will not follow a redirect with a signed
 * authorization in hand. That walk is a report; this is the same
 * discipline as a function, for a reader that needs to buy a PAGE of a
 * directory rather than judge a door — x402scan sells its resource
 * list at a cent a call, and the price exists nowhere but the 402.
 *
 * WHAT IT DOES: GET once; on anything but a 402, return the body (a
 * free door is a free door). On a 402, read PAYMENT-REQUIRED — through
 * headers.get(), which the Fetch spec makes case-insensitive, because
 * x402scan sends it title-case and a buyer that bracket-indexes the
 * upper-case name misses it — choose the exact/Base accept, refuse by
 * every rule below, sign the EIP-3009 authorization, present it in
 * PAYMENT-SIGNATURE, and return that second answer. Once. A 402 to the
 * paid request is recorded as a refusal, never retried: WALKABOUT rule
 * 4, no hammering, and rule 3's spirit — an authorization presented
 * twice is money offered twice.
 *
 * THE REFUSALS, each a named reason on the result rather than a throw:
 *   own_wallet   — the payTo is our field wallet. We do not pay
 *                  ourselves and call it a read.
 *   over_cap     — the challenge asks more than the per-call cap the
 *                  caller set. The house cap for a paid knock is five
 *                  cents; a directory page is one.
 *   unscreened   — the sanctions screen answered null or listed. Rule
 *                  3 fails closed: no screen, no payment.
 *   no_terms     — a 402 with no payable exact/Base accept.
 *   refused_paid — the paid request was answered with another 402.
 *   redirect     — the paid request redirected. Not followed.
 */
export type PayRefusal =
  | "own_wallet"
  | "over_cap"
  | "unscreened"
  | "no_terms"
  | "refused_paid"
  | "redirect";

export interface PayOnceResult {
  status: number;
  /** The final body, when a 2xx was reached. */
  body: string | null;
  /** What was authorised, in USD; zero when nothing was signed. */
  paid_usd: number;
  /** The payee, when a payment was signed. */
  pay_to: string | null;
  refusal?: PayRefusal;
  detail?: string;
}

export interface PayOnceOptions {
  signer: FieldSigner;
  screen: SanctionsScreen;
  /** The most this one call may authorise. */
  perCallCapUsd: number;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  now?: () => Date;
  nonce?: () => string;
}

interface Accept {
  scheme?: string;
  network?: string;
  amount?: string;
  maxAmountRequired?: string;
  asset?: string;
  payTo?: string;
  maxTimeoutSeconds?: number;
  extra?: { name?: string; version?: string };
}

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** The 402 header decoded, or null when nothing readable rode it. */
export function decodeChallenge(header: string | null): { accepts: Accept[] } | null {
  if (!header) return null;
  try {
    const parsed = JSON.parse(atob(header)) as { accepts?: unknown };
    if (!Array.isArray(parsed.accepts)) return null;
    return { accepts: parsed.accepts as Accept[] };
  } catch {
    return null;
  }
}

/** The one accept this helper will pay: exact scheme, USDC on Base. */
export function chooseAccept(accepts: Accept[]): Accept | null {
  return (
    accepts.find(
      (a) =>
        a.scheme === "exact" &&
        a.network === "eip155:8453" &&
        typeof a.payTo === "string" &&
        (a.asset ?? USDC_BASE).toLowerCase() === USDC_BASE.toLowerCase(),
    ) ?? null
  );
}

export async function payOnce(
  url: string,
  options: PayOnceOptions,
): Promise<PayOnceResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = options.timeoutMs ?? 12_000;
  const headers = {
    "User-Agent": options.userAgent ?? "scvd-directory-walk/1.0 (+https://scvd.store/sources)",
    Accept: "application/json",
  };
  const first = await fetchImpl(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeout),
    headers,
  });
  if (first.status !== 402) {
    return {
      status: first.status,
      body: first.ok ? await first.text() : null,
      paid_usd: 0,
      pay_to: null,
    };
  }

  const challenge = decodeChallenge(first.headers.get("PAYMENT-REQUIRED"));
  const chosen = challenge ? chooseAccept(challenge.accepts) : null;
  if (!chosen || !chosen.payTo) {
    return { status: 402, body: null, paid_usd: 0, pay_to: null, refusal: "no_terms", detail: "402 with no exact/Base USDC accept readable from PAYMENT-REQUIRED." };
  }
  const atomic = chosen.amount ?? chosen.maxAmountRequired ?? "0";
  const usd = Number(atomic) / 1e6;
  if (!Number.isFinite(usd) || usd <= 0) {
    return { status: 402, body: null, paid_usd: 0, pay_to: chosen.payTo, refusal: "no_terms", detail: `unreadable amount ${atomic}.` };
  }
  if (usd > options.perCallCapUsd + 1e-9) {
    return { status: 402, body: null, paid_usd: 0, pay_to: chosen.payTo, refusal: "over_cap", detail: `the door asks $${usd.toFixed(4)}; this call may authorise at most $${options.perCallCapUsd.toFixed(2)}.` };
  }
  if (chosen.payTo.toLowerCase() === options.signer.address.toLowerCase()) {
    return { status: 402, body: null, paid_usd: 0, pay_to: chosen.payTo, refusal: "own_wallet", detail: "the payTo is this store's own field wallet." };
  }
  const screened = await options.screen(chosen.payTo);
  if (screened.listed !== false) {
    return {
      status: 402,
      body: null,
      paid_usd: 0,
      pay_to: chosen.payTo,
      refusal: "unscreened",
      detail:
        screened.listed === true
          ? `the payTo is identified on the sanctions screen (${screened.source}); rule 3, payment withheld.`
          : `the sanctions screen did not answer (${screened.source}); rule 3 fails closed, no payment.`,
    };
  }

  const nowSeconds = Math.floor((options.now ?? (() => new Date()))().getTime() / 1000);
  const authorization = {
    from: options.signer.address,
    to: chosen.payTo,
    value: atomic,
    validAfter: "0",
    validBefore: String(nowSeconds + Math.min(chosen.maxTimeoutSeconds ?? 300, MAX_AUTHORIZATION_SECONDS)),
    nonce: (options.nonce ?? randomNonce)(),
  };
  const signature = await options.signer.signTypedData({
    domain: {
      name: chosen.extra?.name ?? "USD Coin",
      version: chosen.extra?.version ?? "2",
      chainId: 8453,
      verifyingContract: (chosen.asset ?? USDC_BASE) as `0x${string}`,
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
  const paymentHeader = btoa(JSON.stringify({ x402Version: 2, accepted: chosen, payload: { signature, authorization } }));

  const second = await fetchImpl(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeout),
    headers: { ...headers, "PAYMENT-SIGNATURE": paymentHeader },
  });
  if (second.status >= 300 && second.status < 400) {
    return { status: second.status, body: null, paid_usd: usd, pay_to: chosen.payTo, refusal: "redirect", detail: `the paid request redirected to ${second.headers.get("location") ?? "an undisclosed location"}; not followed with a signed authorization in hand.` };
  }
  if (second.status === 402) {
    return { status: 402, body: null, paid_usd: usd, pay_to: chosen.payTo, refusal: "refused_paid", detail: "the paid request was answered with another 402. Not retried." };
  }
  return { status: second.status, body: second.ok ? await second.text() : null, paid_usd: usd, pay_to: chosen.payTo };
}
