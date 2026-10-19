import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-10-19",
  what_was_wrong:
    "A confirmed batch_spot_check purchase recovered its certificate after an interrupted request, but its per-settlement record was missing. The recovery alarm completed accounting for MPP, not x402, and could retire after delivering the goods. The hourly raise could not restore evidence that had never been recorded. The sale's revenue and counter remained short until its certificate was backfilled and the next raise ran.",
  how_long:
    "Observed on October 19: the request hit a CPU limit at 10:09 UTC, the certificate was retained at 10:10, and the missing-record alarm first fired at 10:31. The authorized backfill ran around 13:29 and the hourly raise restored the sale's counters at 13:30. The precise interruption point and the omission's introduction date were not reconstructed.",
  found_by:
    "The store's books-invariant alarm identified cert_9xdgjs3j6r. The keeper requested the repair and root-cause investigation. The retained purchase and chain receipt agreed on the payment; a regression reproduced a recovered batch certificate with no settlement record.",
  what_changed:
    "Confirmed x402 purchase recovery now retains its settlement record, including after delivery or when the goods require manual delivery. A failed write leaves a retry armed; successful recovery preserves the request's house classification and does not replay counter increments. Eligible counter floors still come from the hourly raise. The regression fails against the original recovery code. Public count provenance, the README and admin reconciliation explain this two-stage repair. The all-time one-count residue also documented on October 12 remains unresolved after subtracting the separate founding allowance; no counter was decremented to hide it. Historical journals without the request's house classification retain that evidence gap.",
};
