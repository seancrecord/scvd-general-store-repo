import { REFUND_POLICY } from "@/store/refund-policy";
import { requireCommerce, type LicensePolicyClass } from "@/store/commerce";
import { SCVD_NAMESPACE } from "@/lib/ucp/version";
import type { MenuItem } from "@/types";

/**
 * POLICIES IN THE NAMESPACE THIS STORE OWNS.
 *
 * UCP's policy list is open by design: standard types sit beside
 * merchant-defined ones and a platform is expected to carry a type it
 * does not recognise rather than drop it. That is the right shape for
 * a shelf that sells signed observations, prepaid terms and
 * collectible cards, none of which are a return window.
 *
 * Every policy here points at a page a human can read. A policy type
 * whose `url` 404s is worse than no policy, so the paths are the ones
 * the store already serves.
 */
/**
 * `description` IS AN OBJECT, NOT A STRING, and that is the schema's
 * word rather than a preference: common/types/policy.json requires
 * `type` and `description`, and `description` is common/types/
 * description.json — at least one of plain, html or markdown. A
 * string there fails validation, which is how the conformance gate
 * found this one.
 */
export interface UcpPolicy {
  type: string;
  description: { plain: string };
  /** Not a schema field; carried because additionalProperties is open
   * and a one-line label is worth more to a reader than a paragraph. */
  title?: string;
  url?: string;
  /**
   * RFC 9535 JSONPath targets, relative to the response root. Policies
   * ride the RESPONSE rather than the product — that is where the
   * schema puts them and therefore where a platform looks — so each
   * one has to say which products it covers.
   */
  applies_to?: string[];
  [key: string]: unknown;
}

/**
 * DRAFT TERMS, MARKED AS DRAFT ON THE WIRE (2026-09-16).
 *
 * The five classes are structural and the adapter needs them. The
 * WORDS below are a first pass written against the shelf, not terms
 * the keeper has inked, and serving unreviewed terms as settled is
 * exactly the kind of quiet overclaim /corrections exists to catch.
 * So every policy this file emits carries `status: "draft"` until the
 * keeper's ruling replaces it — a reader can act on the class today
 * and knows not to treat the sentence as final. Removing the marker
 * is the commit that adopts the terms.
 */
const TERMS_STATUS = "draft" as const;

const LICENSE_TERMS: Record<
  LicensePolicyClass,
  { title: string; description: string }
> = {
  artifact: {
    title: "Signed artifact",
    description:
      "What you bought is a signed record of what this store observed or made, and it is yours to store, quote, publish and hand to a third party. Its report URL is public and stays public: the point of a signed observation is that somebody other than you can check it. The store keeps the right to keep publishing its own corpus; it claims nothing over what you build on top of the artifact.",
  },
  buyer_content: {
    title: "Buyer-supplied text",
    description:
      "You wrote the words; they stay yours. You grant this store only what it needs to do the job you paid for: store them, sign them into the artifact verbatim, and publish them where the listing says it will. Buyer text is recorded as written and never treated as instructions. Nothing here transfers copyright.",
  },
  collectible: {
    title: "Collectible",
    description:
      "The card is yours — hold it, show it, trade it, let it expire. That is ownership of the issued unit and nothing more: the artwork, the names and the marks on it stay the store's, and buying one grants no licence to reproduce them as your own. No edition here is a security and none is a claim on the store.",
  },
  patronage: {
    title: "Patronage",
    description:
      "Paying this buys exactly what the listing names — the badge, the pass, the certificate and its number — and nothing implied beside it. No equity, no revenue share, no governance, no promised future benefit, no priority at any other door. A patron is a patron.",
  },
  joint_work: {
    title: "Joint work",
    description:
      "This one takes both hands and ships under a shared byline, so its terms are its own rather than the standard artifact ones. Authorship, credit, and who may license the result where are settled in writing with the buyer before the work starts, and the agreed terms ride on the completed order. Nothing is assumed by default.",
  },
};

export function licensePolicy(item: MenuItem, base: string): UcpPolicy {
  const commerce = requireCommerce(item);
  const terms = LICENSE_TERMS[commerce.license_policy];
  return {
    type: `${SCVD_NAMESPACE}.policy.license`,
    class: commerce.license_policy,
    status: TERMS_STATUS,
    title: terms.title,
    description: { plain: terms.description },
    url: `${base}/rights`,
  };
}

/**
 * A TERM IS NOT A SUBSCRIPTION, and the policy says so in a field
 * rather than in prose a reader may skip.
 *
 * `cadence: "term"` means one payment buys a stated stretch of time
 * and then stops. This store has no mechanism that could charge a
 * second time — no stored mandate, no card on file — so
 * `auto_renews: false` is a fact about the architecture, not a
 * promise about intentions. A commerce platform that reads a duration
 * and infers a recurring instrument would be wrong about this shelf,
 * and this is where it finds out.
 */
export function serviceTermPolicy(item: MenuItem, base: string): UcpPolicy | null {
  if (item.cadence !== "term") return null;
  return {
    type: `${SCVD_NAMESPACE}.policy.service_term`,
    title: `Prepaid ${item.term_days}-day term`,
    description: {
      plain: `One payment covers ${item.term_days} days and then stops. Nothing renews: this store holds no mandate and no card, so there is no mechanism that could charge again. Buy it a second time if you want a second term.`,
    },
    term_days: item.term_days,
    auto_renews: false,
    url: `${base}/menu/${item.id}`,
  };
}

/** The delivery promise, and the refund that backs it when missed. */
export function fulfillmentPolicy(item: MenuItem, base: string): UcpPolicy {
  if (item.fulfillment === "human_queue") {
    return {
      type: `${SCVD_NAMESPACE}.policy.fulfillment`,
      title: `Human fulfillment within ${item.sla_hours ?? 168} hours`,
      description: {
        plain: `${REFUND_POLICY.commitment} ${REFUND_POLICY.mechanism}`,
      },
      mode: "human_queue",
      sla_hours: item.sla_hours ?? 168,
      url: `${base}/fulfillment-log`,
    };
  }
  return {
    type: `${SCVD_NAMESPACE}.policy.fulfillment`,
    title: "Delivered in the purchase response",
    description: { plain: REFUND_POLICY.instant_items },
    mode: "instant",
    url: `${base}/fulfillment-log`,
  };
}

/**
 * NOT ESCROW, SAID AT THE CATALOG RATHER THAN DISCOVERED AFTER.
 *
 * A commerce platform reasonably assumes a merchant integration has a
 * dispute path behind it. This one does not, deliberately, and the
 * honest place to say so is beside the price.
 */
export function settlementRiskPolicy(base: string): UcpPolicy {
  return {
    type: `${SCVD_NAMESPACE}.policy.settlement_risk`,
    title: "Not escrow",
    description: { plain: REFUND_POLICY.what_this_is_not },
    escrow: false,
    custodial: false,
    url: `${base}/rights`,
  };
}

export function policiesFor(item: MenuItem, base: string): UcpPolicy[] {
  const policies: UcpPolicy[] = [
    licensePolicy(item, base),
    fulfillmentPolicy(item, base),
    settlementRiskPolicy(base),
  ];
  const term = serviceTermPolicy(item, base);
  if (term) policies.push(term);
  return policies;
}
