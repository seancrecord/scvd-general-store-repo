import { canonicalAddress } from "@/lib/addresses";
import {
  disclosedAnything,
  disclosedFields,
  returningVerdict,
  type Disclosure,
  type ReturningVerdict,
} from "@/lib/disclosure";
import { getCertificate } from "@/services/certificates";
import { recordDisclosure } from "@/services/disclosure-census";
import type { Env } from "@/types";

/**
 * WHAT THE STORE SAYS BACK ABOUT WHAT IT WAS TOLD.
 *
 * Runs once per settled purchase, after the payer is known. Three
 * jobs, in this order: check a prior-certificate claim against this
 * payment's payer (a verification, not a claim — the certificate
 * already names its payer); take the census count, offered or filled;
 * and hand the response one small block that says what was recorded,
 * what was not, and what none of it changed. A buyer that disclosed
 * nothing gets no block at all: the ask lives in the schema, and a
 * response that nags for it would be the form this store does not
 * run.
 *
 * `payer_mismatch` and `not_found` ride out as words, never folded
 * into a boolean, so an unverified claim can never read as a quiet
 * yes — the guestbook's verified_identity posture, at the till.
 */
export async function disclosureAfterSettle(
  env: Env,
  disclosure: Disclosure | undefined,
  payer: string | undefined,
): Promise<Record<string, unknown>> {
  const told = disclosure ?? {};
  let returning: ReturningVerdict | undefined;
  if (told.prior_cert_id) {
    const prior = await getCertificate(env, told.prior_cert_id).catch(() => null);
    returning = returningVerdict(prior ? (prior.certificate.payer ?? "") : null, payer, canonicalAddress);
  }
  await recordDisclosure(env, "paid", told, returning);
  if (!disclosedAnything(told)) return {};
  return {
    disclosure: {
      recorded: disclosedFields(told),
      on_certificate: "none of these. agent_name and purpose are the only buyer words a certificate carries.",
      ...(returning ? { returning, returning_means: RETURNING_MEANS[returning] } : {}),
      changed: "nothing. Same price, same delivery, same credit as a buyer who said nothing.",
    },
  };
}

const RETURNING_MEANS: Record<ReturningVerdict, string> = {
  verified: "The certificate you named was paid by the wallet that paid for this. Two purchases, one buyer, no account.",
  payer_mismatch: "The certificate you named exists, but a different wallet paid for it. Recorded as a claim, not a link.",
  not_found: "No certificate by that id here. Recorded as a claim, not a link.",
  no_payer: "This payment carried no payer we could compare, so the claim stays a claim.",
};
