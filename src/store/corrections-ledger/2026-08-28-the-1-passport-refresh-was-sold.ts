import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-08-28",
  what_was_wrong:
    "The $1 passport refresh was sold with 'the newest observation wins in BOTH directions — a broken finding turns the chip off,' and the $19 trust profile's own copy promised 'a host that breaks mid-term shows broken on its own page.' The passport and the chip kept the promise; the profile page and index never read the refresh at all. A door that broke mid-term, with the break recorded by a paid refresh, went dark on its chip and its passport while staying ready-side on the paid standing page — the one URL its operator hands to counterparties — until the next weekly round.",
  how_long: "Since hosted profiles shipped.",
  found_by: "The instrument audit, in-house.",
  what_changed:
    "The profile view derives from the same newest-wins fold the passport uses, so the two surfaces can no longer disagree about which observation is newest. A test breaks a profiled host mid-term with a refresh and requires the standing page to say broken that hour and the index to drop the name (test/passport-refresh.spec.ts) — the mechanism is the shared code path plus the test that walks it, not a matching sentence.",
};
