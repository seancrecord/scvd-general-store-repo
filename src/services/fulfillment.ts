import { sendAlert } from "@/lib/alerts";
import { currentWeekKey } from "@/lib/kv-keys";
import type { SettledPayment } from "@/lib/payments";
import { mintCertificate } from "@/services/certificates";
import { deliverInstantGoods } from "@/services/instant-goods";
import { createLucky, takeStockedLucky } from "@/services/luckies";
import { completeOrder, createOrder, recordInventorySale } from "@/services/orders";
import { luckyNote } from "@/store/copy";
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

export interface FulfillmentInput {
  agentName?: string;
  callbackUrl?: string;
  /** context_anchor: pre-validated summary. */
  summary?: string;
  /** phantom_check: pre-validated URL. */
  targetUrl?: string;
  /** coffees_for_closers: the win, pre-validated, recorded verbatim. */
  win?: string;
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

  // The stocked lucky shelf: if the keeper picked ahead, the next
  // lucky comes off the shelf now and the order completes itself.
  // An empty shelf falls back to the queue; the 168h promise stands.
  if (item.id === "luckies") {
    const stocked = await takeStockedLucky(env).catch(() => null);
    if (stocked) {
      const record = await createLucky(env, {
        name: stocked.name,
        provenance: stocked.provenance,
        power: stocked.power,
        strength: stocked.strength,
        orderId: order.order_id,
        certId: minted.certificate.cert_id,
        patronNumber: minted.patronNumber,
      });
      const base = env.STORE_BASE_URL;
      const note = luckyNote({
        name: record.lucky.name,
        strength: record.lucky.strength,
        cardUrl: `${base}/luckies/${record.lucky.lucky_id}.svg`,
        recordUrl: `${base}/api/lucky/${record.lucky.lucky_id}`,
      });
      await completeOrder(env, order.order_id, note);
      return {
        message: VOICE.instantThanks,
        order_id: order.order_id,
        status: "completed",
        deliverable: note,
        lucky_id: record.lucky.lucky_id,
        card_url: `${base}/luckies/${record.lucky.lucky_id}.svg`,
        record_url: `${base}/api/lucky/${record.lucky.lucky_id}`,
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
