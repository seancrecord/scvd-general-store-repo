import { createPaymentGate } from "@/lib/payment-gate";

/**
 * THE STORE'S GATE, NATIVE LANE INCLUDED (native publications,
 * 2026-09-19). The shelf's doors get their gate through
 * createDoorChecks in routes/buy.ts; the publication doors used the
 * bare x402 gate, which meant a page could be bought over x402 and
 * never over MPP. This is the same loader the shelf uses, in a module
 * only store route files import: payment-gate.ts is shared with the
 * doors Worker, and a dynamic import of the settlement SDK in shared
 * code would bundle it into the lightweight Worker.
 */
export const storePaymentGate = createPaymentGate(() => import("@/lib/mpp-checkout"));
