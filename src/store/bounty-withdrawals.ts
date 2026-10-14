/** Dated keeper withdrawals. Original captured terms and paid claims stay intact. */
export const BOUNTY_WITHDRAWALS: Readonly<Record<string, {
  date: string;
  reason: string;
  correction_url: string;
}>> = {
  bty_af4ww9tx: {
    date: "2026-10-13",
    reason: "This listing captured a Gateway/batched price, but the claim verifier requires an individual payer-to-payTo USDC Transfer. Do not pay against this listing or substitute a manual transfer. If you already spent money before this withdrawal, send the keeper the bounty id and transaction evidence at /api/letter for review; this is not a promise of payment.",
    correction_url: "/corrections",
  },
};
