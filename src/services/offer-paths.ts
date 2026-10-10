import { OFFER_PATHS } from "@/store/offer-paths";
import { getMenuItem } from "@/store/menu";
import { priceLine, amountPhrase } from "@/services/menu-markdown";
import { EVIDENCE_PILOT, PILOT_MONEY } from "@/store/evidence-pilot";
import { COMMISSION_RUNGS } from "@/store/commission-desk";
import { STORE_CONTACT_EMAIL } from "@/store/metadata";
import { PREFLIGHT_VERSION_NEXT } from "@/services/preflight";

/** No storage reads: prices and timing come from the terms used at their own doors. */
export function offerPaths(base: string) {
  return OFFER_PATHS.map(offer => {
    const common = { ...offer, url: `${base}/operators#${offer.id}` };
    if ("item_id" in offer) {
      const item = getMenuItem(offer.item_id);
      if (!item) throw new Error("Offer path names an item absent from the shelf");
      return { ...common,
        price_short: `${amountPhrase(item, { currency: true })} · ${item.term_days ? `${item.term_days}-day term` : "one-off"}`,
        price: priceLine(item, { currency: true }), price_amount: item.price_usdc, currency: "USDC",
        cadence: item.cadence,
        ...(item.term_days ? { term_days: item.term_days } : {}),
        delivery: item.sla_hours ? `Human-delivered within ${item.sla_hours} hours; checkout checks availability and quotes the refund terms.` : "The purchase starts a bounded watch; observations accumulate during its term. No automatic renewal.",
        free_first: { label: "Run a free endpoint preflight", url: `${base}/try`, method: "GET",
          api_request: { method: "POST", url: `${base}/api/preflight/${PREFLIGHT_VERSION_NEXT}`, body: { url: "https://your-public-endpoint.example/paid-resource" } } },
        next_step: { label: offer.next_label, url: `${base}/menu/${item.id}`, method: "GET" },
      };
    }
    if (offer.id === "review-report") return { ...common,
      price_short: `$${EVIDENCE_PILOT.price_usd} ${EVIDENCE_PILOT.currency} · ${EVIDENCE_PILOT.duration_days}-day pilot`,
      price: PILOT_MONEY, price_amount: EVIDENCE_PILOT.price_usd, currency: EVIDENCE_PILOT.currency,
      delivery: `One final report after ${EVIDENCE_PILOT.duration_days} days of daily observations, from an agreed start date.`,
      free_first: { label: "Read the illustrative report", url: `${base}${EVIDENCE_PILOT.path}#sample`, method: "GET" },
      next_step: { label: offer.next_label, url: `${base}${EVIDENCE_PILOT.path}`, method: "GET" },
    };
    return { ...common,
      price_short: "Free brief, then a keeper quote",
      price: "Free to request; scope, price and delivery window are agreed by keeper quote before payment.",
      published_rungs_usdc: COMMISSION_RUNGS,
      delivery: "The quote sets the delivery window. No work starts or money moves just by reading or sending a request.",
      free_first: { label: "Read commission terms and past decline reasons", url: `${base}/api/commission/declined`, method: "GET" },
      next_step: { label: offer.next_label, url: `${base}/api/commission/declined`, method: "GET" },
      request: { method: "POST", url: `${base}/api/request`,
        body: { description: "The decision, public endpoints, requested evidence and deadline", offer_usdc: 0, contact: "Your reply address" },
        note: "Replace the example with your brief, proposed USDC budget and contact. Requesting is free; only a later accepted quote can be paid.",
        human_url: `mailto:${STORE_CONTACT_EMAIL}?subject=${encodeURIComponent("Scope a platform or agency review")}` },
    };
  });
}
