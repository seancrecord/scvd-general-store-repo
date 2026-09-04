import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-08-28",
  what_was_wrong:
    "The store's most-quoted fact — '34 of 35 hosts serve no signed offers at all' — and every signed-offers number downstream of the shared battery asserted an absence the instrument could not see. The probe read the offers extension only from the PAYMENT-REQUIRED header, while the offer-receipt convention places offers first in the 402 body — a placement our own till emits and our own battery never parsed. The free preflight served the claim, the $5 audit signed it, the $5 conformance watch signed it daily into paying customers' records, the census sealed it into the Bitcoin-anchored corpus, and /registry captioned it as the market's trust gap. The denominator also silently excluded this store's own door — the one door known to serve signed offers — and no caption said so. Whether any of the 34 served body-placed offers is unknown, which is the defect: 'at all' was published where 'in the one placement we read' was the observation.",
  how_long:
    "From the census of 2026-08-03 on the quoted copy, and in every weekly round's signed_offers aggregate since the market desk shipped. The anchored rows keep their bytes: rewriting a signed artifact to look correct is the failure this record exists to refuse — instead every stored week now reads as what it was, because the basis field below is absent from all of them.",
  found_by:
    "The keeper, catching the market desk publishing '0% of ready doors serve signed offers' as an ecosystem fact on 2026-08-27, and the instrument audit that followed, which found the same header-only read in the one battery all five instruments share.",
  what_changed:
    "The battery reads both placements — header first (the copy our own till reads back), body second — and asserts absence only over the placements actually read; a caller that withholds the body gets an advisory that says so. The market aggregate carries OFFERS_READ_BASIS the way rails carry RAIL_BASIS, so header-only history can never silently mix with post-fix weeks in the anchored chain. A fixture door serving offers only in the body fails the build if the battery ever again claims absence from fewer placements than the store's own till emits (test/offer-placement.spec.ts, test/fixtures/doors/body-offers.json), and every caption that quotes the number now states the placement scope and the self-exclusion. The old census figure stands as a dated finding in its measured scope; the next round's number is a new dated finding, taken with both eyes open.",
};
