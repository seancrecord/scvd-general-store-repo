import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-10-22",
  what_was_wrong:
    "Credit cash-out instructions called the signature the payment and said an unredeemed authorization could expire with nothing lost and be requested again. The artifact description also said nothing was owed after expiry. A signature permits a transfer; it does not prove receipt, and expiry alone does not resolve an underlying obligation. A lost response did not have a dedicated saved-authorization recovery path.",
  how_long:
    "Present in the source before this correction on 2026-10-22. The start of the affected period and any production loss have not been established.",
  found_by:
    "Review of the earning and cash-out path while adding recovery for a lost authorization response.",
  what_changed:
    "The instructions and artifact description now distinguish authorization, expiry and received payment. Newly saved credit authorizations can be retrieved after a fresh recovery-only signature from the earning wallet, with their original bytes, nonce and expiry. Recovery creates no replacement and spends no newly accrued credit. Tests cover lost save replies, signer rotation, expiry, recipient binding and challenge-mode substitution. Older or unsaved authorizations remain unavailable through this path; an interrupted save is not treated as payment or permission to sign again.",
};
