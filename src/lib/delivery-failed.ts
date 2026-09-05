import { sendAlert } from "@/lib/alerts";
import type { SettledPayment } from "@/lib/payments";
import type { Env, MenuItem } from "@/types";

/**
 * MONEY MOVED AND THE GOODS DID NOT (2026-09-04, CV's second round).
 *
 * Rule 9 settles at the last line before the mint, so a failure after
 * that line is rare and owned: the delivery-intent row is open, the
 * hourly audit pages the keeper, and /trust lists the certificate if
 * the mint got that far. What the BUYER got, until now, was a 500
 * whose copy says "no charge for the noise" — false, the one time it
 * mattered — or a JSON-RPC internal error with nothing in it. A
 * stranger who does not know the recovery path experiences "paid,
 * got nothing", and has no transaction hash to argue with.
 *
 * So both doors answer the same way when a throw arrives after
 * settlement: the truth, in fields. charged: true, the transaction,
 * the rail, and where to look — the verify endpoint answers for any
 * certificate that was minted, the delivery desk holds the row, and
 * the keeper is paged by this same call. The throw is still recorded
 * as the failure it is; what changed is that the buyer is told.
 */
export const DELIVERY_FAILED_CODE = "delivery_failed";

export function deliveryFailedBody(
  base: string,
  item: MenuItem,
  settled: SettledPayment,
): Record<string, unknown> & { error: string } {
  return {
    error: `Your payment for "${item.name}" settled and the delivery then failed on our side. This is our failure, not yours, and it is the one failure this store has agreed to own: the money moved, the goods did not leave. The keeper has been paged with your transaction, and the delivery is finished by hand.`,
    // The literal, not the constant: the rule-57 guards walk this
    // file's source for `code: "..."`, the same way they walk the doors.
    code: "delivery_failed",
    charged: true,
    paid_usdc: settled.paidUsdc,
    transaction: settled.transaction,
    ...(settled.network ? { network: settled.network } : {}),
    ...(settled.payer ? { payer: settled.payer } : {}),
    recovery: {
      do_not_retry:
        "Do not buy again. A second purchase is a second charge; this one is already yours and is being finished.",
      certificate:
        "If the mint completed before the failure, your certificate already exists and verifies: the receipt for your wallet is listed at the trust page, and any cert_id answers at the verify URL.",
      trust_url: `${base}/trust`,
      verify_url: `${base}/api/verify/{cert_id}`,
      how_it_gets_finished:
        "The transaction is on the delivery desk as an undelivered sale. The keeper delivers it by hand or refunds it, and house rule 10 says you do not have to ask.",
    },
  };
}

/** The page, keyed by transaction so one failure pages once. */
export function pageDeliveryFailed(
  env: Env,
  item: MenuItem,
  settled: SettledPayment,
  door: "http" | "mcp",
  error: unknown,
): Promise<void> {
  return sendAlert(env, {
    condition: "undelivered_sale",
    key: settled.transaction,
    detail: `${item.id} settled (${settled.transaction}${settled.network ? ` on ${settled.network}` : ""}) at the ${door} door and the delivery then threw: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}. The buyer was told, with the transaction and the recovery path. Finish it by hand from the delivery desk.`,
  }).catch(() => undefined);
}
