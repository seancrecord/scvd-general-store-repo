import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-08-28",
  what_was_wrong:
    "The conformance desk's docs promised: resolve_key false 'refuses did:web resolution,' and past the budget 'nothing is denied — signature unchecked.' The verifier library underneath, given no fetch of its own, fell back to the bare platform fetch whenever no key was established and the kid was did:web — which is exactly the declined path, the exhausted-budget path, and the failed-resolution path. On the three paths that promised no request, the desk could make a raw, redirect-following, unbudgeted request to a stranger's host in the caller's name. And a resolution we attempted and failed — the issuer's DID host slow from our vantage for three seconds — was booked as the artifact's does_not_conform: our blindness published as their defect.",
  how_long: "Since the desk shipped.",
  found_by:
    "The instrument audit, reading the verifier's fallback against the desk's promises.",
  what_changed:
    "The desk resolves exactly once, through its guarded fetch; the verifier now receives a fetch that refuses, so the fallback cannot fire. A signature left unchecked for our reasons reads could_not_check, never does_not_conform; a kid absent from a document we did read stays the document's fact. The test counts fetch calls per key_resolution state (test/conformance-desk-egress.spec.ts) — the only way a promise about not fetching can be held.",
};
