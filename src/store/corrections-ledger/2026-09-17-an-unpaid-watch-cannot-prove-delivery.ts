import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-09-17",
  what_was_wrong:
    "Preflight's evidence ladder named The Night Watch as the instrument for L4-L6: whether paying a door produces the goods. The Night Watch makes unpaid structural probes. It does not buy from the observed door and cannot establish paid delivery. A cold buyer repeated the recommendation in its report.",
  how_long:
    "The ladder was introduced on 2026-09-16. The incorrect recommendation was still served during the frozen buyer run on the evening of 2026-09-17. That run spent no money; it does not establish that anyone bought the wrong instrument.",
  found_by:
    "The directed cold-buyer acceptance run, followed by a review of the returned preflight and the recommended instrument's actual read class.",
  what_changed:
    "The L4-L6 recommendation now names The Launch Check, which attempts a purchase under its screening, authorization and spend limits. The reading states that an attempt can stop short and does not promise delivery or completion of every rung. The regression test in test/preflight-evidence-handoff.spec.ts checks both preflight batteries against the recommended item's purchase read class and its actual contract and unpaid quote. The original buyer evidence remains unchanged.",
};
