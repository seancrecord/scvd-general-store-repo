import { storeIdentity } from "@/lib/identity";
import { canonicalizeCertificate } from "@/lib/signing";
import { sendAlert } from "@/lib/alerts";
import { currentWeekKey } from "@/lib/kv-keys";
import type { SettledPayment } from "@/lib/payments";
import { mintCertificate } from "@/services/certificates";
import { observeSettlement } from "@/services/attestation";
import type {
  AttestationQuery,
  SignedAttestation,
} from "@/services/attestation";
import { deliverInstantGoods } from "@/services/instant-goods";
import {
  completeOrder,
  createOrder,
  recordInventorySale,
} from "@/services/orders";
import { listStock, takeStockUnit } from "@/services/stock";
import { bestowedNameNote, drawerNote } from "@/store/copy";
import { VOICE } from "@/store";
import type { Env, MenuItem } from "@/types";

/**
 * What happens after money settles, on any channel: mint the
 * certificate, then deliver instant goods or open a human-queue order.
 * The HTTP buy route and the MCP tools both call this, one till, two
 * doors. Never call without a settled payment in hand.
 */

/** The counter takes a win of up to this many characters. */
export const COFFEE_WIN_CAP = 200;

/** The register holds this much grievance. Spite survives compression. */
export const GRIEVANCE_CAP = 280;

/** Live stock for a stocked item. */
export async function stockedShelfCount(
  env: Env,
  item: MenuItem,
): Promise<number> {
  return (await listStock(env, item.id).catch(() => [])).length;
}

export interface FulfillmentInput {
  agentName?: string;
  callbackUrl?: string;
  /** context_anchor: pre-validated summary. */
  summary?: string;
  /** phantom_check: pre-validated URL. */
  targetUrl?: string;
  /** coffees_for_closers: the win, pre-validated, recorded verbatim. */
  win?: string;
  /** grudge: the grievance, pre-validated, held verbatim. */
  grievance?: string;
  /** graffiti_on_a_train: the tag, pre-validated, sprayed verbatim. */
  tag?: string;
  /** settlement_attestation: what to look up on Base. */
  attestationQuery?: AttestationQuery;
  /** recurring_patronage: pass to extend. */
  passId?: string;
  /** the_confession: the confession itself, pre-validated. */
  confessionText?: string;
  /** Human-queue task detail. Untrusted. */
  detail?: string;
  source?: string;
  userAgent?: string;
  referrer?: string;
}

export async function fulfillPurchase(
  env: Env,
  item: MenuItem,
  payment: SettledPayment,
  input: FulfillmentInput,
): Promise<Record<string, unknown>> {
  const mintOptions: Parameters<typeof mintCertificate>[1] = {
    itemId: item.id,
  };
  if (input.agentName) {
    mintOptions.agentName = input.agentName;
  }
  if (payment.tipUsdc > 0) {
    mintOptions.tipUsdc = payment.tipUsdc;
  }
  /**
   * THE AMOUNT, THE PAYER AND THE CHAIN TRANSACTION, into the signed
   * certificate. All three were already in hand at this line and none
   * of them reached the artifact — the store knew what was paid, by
   * which wallet, in which transaction, and issued a receipt that said
   * none of it. Found by an outside operator's conformance list rather
   * than from in here, which is now the second time that has been the
   * instrument that worked.
   */
  mintOptions.paidUsdc = payment.paidUsdc;
  if (payment.payer) {
    mintOptions.payer = payment.payer;
  }
  if (payment.transaction) {
    mintOptions.settlementTx = payment.transaction;
  }
  if (payment.network) {
    mintOptions.network = payment.network;
  }
  if (item.id === "certificate_of_patronage") {
    mintOptions.patronage = true;
  }
  if (item.id === "coffees_for_closers" && input.win) {
    mintOptions.win = input.win;
  }
  if (item.id === "graffiti_on_a_train" && input.tag) {
    mintOptions.tag = input.tag;
  }
  // The attestation has to be MADE before the certificate can bind its
  // evidence hash, so this one item observes first and mints second.
  // Everything else mints first; the order is the exception, and the
  // reason is that /api/verify must cover the observation without a
  // second endpoint existing.
  let attestation: SignedAttestation | undefined;
  if (item.id === "settlement_attestation") {
    attestation = await observeSettlement(env, input.attestationQuery ?? {});
    mintOptions.attests = attestation.evidence_hash;
  }
  // Shelf witness mark: applies itself from the listing date, no opt-in.
  if (currentWeekKey() === item.listed_week) {
    mintOptions.witness = true;
  }
  let minted: Awaited<ReturnType<typeof mintCertificate>>;
  try {
    minted = await mintCertificate(env, mintOptions);
  } catch (error) {
    await sendAlert(env, {
      condition: "signing_failure",
      detail: `mintCertificate threw for ${item.id}: ${String(error)}`,
    });
    throw error;
  }

  /**
   * The public key and the signed bytes ride the purchase response, not
   * only /api/verify. Same defect, same fix: a holder had the
   * certificate and the signature and no way to check one against the
   * other without guessing the canonicalization. Found from outside
   * 2026-07-30.
   */
  const patronBlock = {
    patron_number: minted.patronNumber,
    badge_url: minted.badgeUrl,
    certificate: minted.certificate,
    signature: minted.signature,
    public_key: minted.publicKey,
    algorithm: "ed25519",
    signed_payload: canonicalizeCertificate(minted.certificate),
    signature_covers:
      "signed_payload is the exact UTF-8 string the signature covers: ed25519_verify(utf8(signed_payload), hex_to_bytes(signature), hex_to_bytes(public_key)). Compare its fields against the certificate above; nothing shown there is outside it.",
    verify_url: minted.verifyUrl,
    /**
     * THE BREADCRUMB. Assembled at serve time and stored nowhere, so
     * the wording can improve for artifacts already in strangers'
     * hands. Never inside signed_payload — see storeIdentity().
     */
    store_identity: storeIdentity(env.STORE_BASE_URL),
    verification:
      "Re-verification is free, forever, no purchase required, that URL answers as many times as anyone asks.",
    /**
     * WHICH CHECK IS WORTH DOING, added 2026-08-02 after a cold walk
     * flagged post-purchase verification as the step agents skip.
     *
     * It was 90% closed already — signed_payload and signature_covers
     * above give the exact bytes and the exact call, so a local check
     * needs no request. What was missing is the part that decides
     * whether to bother, and the honest version is not flattering to
     * the round trip: verifying OUR certificate against OUR key that
     * we handed you in THIS response proves the response was not
     * mangled in transit. It cannot prove we were honest, because a
     * liar signs its lie and confirms it twice.
     *
     * The durable value belongs to somebody else's check later, which
     * is a property of the artifact rather than an action the buyer
     * takes. Saying so is better than urging a ritual whose worth we
     * would be overstating.
     */
    /**
     * THE HANDOFF ARTIFACT (DEMAND_SYNTHESIS part 5, built 2026-08-04
     * after the cross-model walks made the case concrete): most
     * autonomous purchases end with a HUMAN approving what the agent
     * did, and one walker this week fabricated a receipt polished
     * enough to fool a skimming human. This line is for that moment —
     * one sentence the agent pastes upstream, carrying the one URL
     * whose answer does not depend on the agent's honesty. Serves the
     * honest buyer (proof in hand), the approver (one click), and
     * makes the fabricator's job strictly harder, because the line it
     * would have to fake points at a check it cannot fake.
     */
    show_your_human: `Bought "${item.name}" from Sean-Claude Van Damme's General Store for $${minted.certificate.paid_usdc ?? item.price_usdc} USDC — independently verifiable (no login, not our word): ${minted.verifyUrl}`,
    which_check_is_worth_doing:
      "You can verify this locally RIGHT NOW with no network call — signed_payload and signature_covers above are everything the check needs. Worth doing: it catches a mangled or tampered response. Be clear on what it does NOT do: checking our signature against our key, both handed to you in this same response, cannot prove we were honest, because a dishonest issuer signs its lie and confirms it twice. The verify_url is not really for you — it is for whoever you show this to later, and THAT check is the one carrying the weight. Keep the artifact; the value is that a third party can check it without us.",
  };

  if (item.fulfillment === "instant") {
    const goodsInput: Parameters<typeof deliverInstantGoods>[2] = {
      patronNumber: minted.patronNumber,
    };
    if (input.agentName) {
      goodsInput.agentName = input.agentName;
    }
    if (input.summary !== undefined) {
      goodsInput.summary = input.summary;
    }
    if (input.targetUrl !== undefined) {
      goodsInput.targetUrl = input.targetUrl;
    }
    if (input.passId) {
      goodsInput.passId = input.passId;
    }
    if (input.confessionText !== undefined) {
      goodsInput.confessionText = input.confessionText;
    }
    if (input.win !== undefined) {
      goodsInput.win = input.win;
    }
    if (input.grievance !== undefined) {
      goodsInput.grievance = input.grievance;
      goodsInput.paidUsdc = payment.paidUsdc;
    }
    if (input.tag !== undefined) {
      goodsInput.tag = input.tag;
    }
    if (attestation) {
      goodsInput.attestation = attestation;
    }
    // The grudge register, the lucky draw and the train all key off
    // the cert: the certificate is the thing the buyer actually holds.
    goodsInput.certId = minted.certificate.cert_id;
    const goods = await deliverInstantGoods(env, item, goodsInput);
    return {
      message: VOICE.instantThanks,
      item_id: item.id,
      deliverable: goods.deliverable,
      paid_usdc: payment.paidUsdc,
      tip_usdc: payment.tipUsdc,
      ...(goods.extras ?? {}),
      ...patronBlock,
    };
  }

  const orderOptions: Parameters<typeof createOrder>[1] = {
    item,
    paidUsdc: payment.paidUsdc,
    tipUsdc: payment.tipUsdc,
    patronNumber: minted.patronNumber,
    certId: minted.certificate.cert_id,
  };
  if (payment.payer) {
    orderOptions.payer = payment.payer;
  }
  if (input.agentName) {
    orderOptions.agentName = input.agentName;
  }
  if (input.callbackUrl) {
    orderOptions.callbackUrl = input.callbackUrl;
  }
  if (input.detail) {
    orderOptions.detail = input.detail;
  }
  if (input.source) {
    orderOptions.source = input.source;
  }
  if (input.userAgent) {
    orderOptions.userAgent = input.userAgent;
  }
  if (input.referrer) {
    orderOptions.referrer = input.referrer;
  }
  const order = await createOrder(env, orderOptions);
  const soldNow = await recordInventorySale(env, item);
  /**
   * THE OVERSELL BACKSTOP (Part A, A.2). The stock race cannot be
   * prevented on KV; it can be refused silence. A sale that lands
   * past the ceiling alerts with the order id and the refund
   * instruction — the keeper's hand settles it (refund one, or fill
   * it anyway if his week allows; his call, but never unknowing).
   */
  if (
    soldNow !== null &&
    item.weekly_inventory !== undefined &&
    soldNow > item.weekly_inventory
  ) {
    await sendAlert(env, {
      condition: "worker_health",
      detail: `OVERSOLD: ${item.id} sale #${soldNow} against a ceiling of ${item.weekly_inventory} (order ${order.order_id}). Two buyers passed the stock gate concurrently — settle it by hand: refund one via /admin, or fulfill it if the week allows. This alert exists so an oversell is never silent.`,
    }).catch(() => undefined);
  }

  // Stocked shelves (the drawer, the name pool): the unit is
  // keeper-made already; the order completes itself. Bare shelves
  // never reach here (the buy route sells out honestly pre-402); this
  // take is belt-and-braces against the take-race.
  if (item.stocked) {
    const unit = await takeStockUnit(env, item.id).catch(() => null);
    if (unit) {
      const note =
        item.id === "the_drawer"
          ? drawerNote(unit.fields["item"] ?? "", unit.fields["does"] ?? "")
          : bestowedNameNote(unit.fields["name"] ?? "");
      await completeOrder(env, order.order_id, note);
      return {
        message: VOICE.instantThanks,
        order_id: order.order_id,
        status: "completed",
        deliverable: note,
        order_url: `${env.STORE_BASE_URL}/api/order/${order.order_id}`,
        paid_usdc: payment.paidUsdc,
        tip_usdc: payment.tipUsdc,
        ...patronBlock,
      };
    }
  }

  return {
    message: VOICE.queueConfirmation,
    order_id: order.order_id,
    status: order.status,
    sla_hours: order.sla_hours,
    order_url: `${env.STORE_BASE_URL}/api/order/${order.order_id}`,
    paid_usdc: payment.paidUsdc,
    tip_usdc: payment.tipUsdc,
    ...patronBlock,
  };
}
