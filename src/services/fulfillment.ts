import { sendAlert } from "@/lib/alerts";
import { currentWeekKey } from "@/lib/kv-keys";
import type { SettledPayment } from "@/lib/payments";
import { mintCertificate } from "@/services/certificates";
import type { AttestationQuery } from "@/services/attestation";
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
  if (item.id === "certificate_of_patronage") {
    mintOptions.patronage = true;
  }
  if (item.id === "coffees_for_closers" && input.win) {
    mintOptions.win = input.win;
  }
  if (item.id === "graffiti_on_a_train" && input.tag) {
    mintOptions.tag = input.tag;
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

  const patronBlock = {
    patron_number: minted.patronNumber,
    badge_url: minted.badgeUrl,
    certificate: minted.certificate,
    signature: minted.signature,
    verify_url: minted.verifyUrl,
    verification:
      "Re-verification is free, forever, no purchase required, that URL answers as many times as anyone asks.",
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
    if (input.attestationQuery !== undefined) {
      goodsInput.attestationQuery = input.attestationQuery;
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
  await recordInventorySale(env, item);

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
