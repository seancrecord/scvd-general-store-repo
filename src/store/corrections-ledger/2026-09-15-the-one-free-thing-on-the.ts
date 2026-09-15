import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-09-15",
  what_was_wrong:
    "The card rack on the front page, shipped 2026-09-14, offered \"Ring the bell — free\" as an ordinary link to /api/bell. That door is POST-only. A link is a GET, so the one free thing on the storefront answered a visitor with the store's own method refusal — {\"error\":\"This door exists and takes POST, not GET.\"} — and on a phone browser it arrived as a download prompt for a 217-byte bell.json. Nothing was broken underneath: the refusal was accurate, the bell worked, and every agent using POST /api/bell or the ring_bell tool was unaffected. The only people it failed were the ones the rack was built for.",
  how_long:
    "From the card rack's deploy on 2026-09-14 to 2026-09-15, under a day. No count of visitors who hit it can be given; the store does not log who tapped what.",
  found_by:
    "The keeper, on his phone, doing the first thing the front page invites a person to do, on 2026-09-15.",
  what_changed:
    "The bell is a room now: GET /bell renders it with a form, POST /bell rings it and renders the card you got with its face, its share button and its PNG — the same shape as the pack page, because a free card and a bought one deserve the same moment. POST /api/bell is untouched, so agents keep the door they have. The mechanism against recurrence is a guard that reads the app's OWN route table rather than a list somebody types: test/storefront-card-rack.spec.ts collects every path registered for POST and not for GET, then fails if any anchor on the storefront points at one. A typed list of known-bad paths would have repeated the original mistake one layer up. The guard was verified by reverting the href and watching it name /api/bell, then restored. The case that had asserted the broken href — which is how a full green suite shipped this — now asserts the room.",
};
