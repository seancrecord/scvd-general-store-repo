import { PILOT_MONEY, EVIDENCE_PILOT } from "@/store/evidence-pilot";
export const SELLER_DECLARATIONS_PATH = "/seller-declarations";
export const DECLARATION_PROPOSITION = "Declare receiving addresses with proof of control and compare their digests with dated observations of a public payment endpoint.";
export const DECLARATION_FREE = "Free to submit and read; the declaration and its comparison remain available without buying a watch or report.";
export const DECLARATION_MONEY = PILOT_MONEY;
export function declarationNextSteps(base: string) {
  return { free: { url: `${base}${SELLER_DECLARATIONS_PATH}`, description: DECLARATION_FREE },
    report: { url: `${base}${EVIDENCE_PILOT.path}`, description: PILOT_MONEY, scope: "Daily payment-interface checks and a review report; no declaration-change alerts." } };
}
