import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-09-15",
  what_was_wrong:
    "The 2026-09-02 rule is that a crawler this store names in robots.txt gets the PAGE when it states no preference, so an answer engine sending a bare wildcard receives the title, the description and the JSON-LD rather than a JSON body with none of them. That rule held in every negotiated room except one. /scorers called wantsHtml() with the Accept header and without the User-Agent, so every named indexer — OAI-SearchBot, PerplexityBot, Google-Extended, ora-agent and the rest — asking with `*/*` was handed JSON. The room it was wrong in is the worst one available: /scorers is the page addressed TO scorers and marketplaces, about how to pull, verify and cite this store's evidence, and the engines that would do the citing were the exact callers being served the one representation with nothing to cite in it.",
  how_long:
    "From 2026-09-02, when the named-crawler negotiation shipped and this call site was not updated with the others, until 2026-09-15. Thirteen days.",
  found_by:
    "Not the scan that prompted the surrounding work, which never reported it. The nine landing pages that gained a markdown twin were added to test/crawler-negotiation.spec.ts to prove the twin had not cost the answer engines their JSON-LD — the position this store had just decided to hold. That assertion went red on /scorers, for a reason older than the change it was written to guard.",
  what_changed:
    "The call passes the User-Agent, as every other negotiated room already did. The mechanism is the test that caught it: crawler-negotiation.spec.ts now walks all eleven rooms with a real markdown representation and asserts, per room, that a named READER gets markdown and a named INDEXER gets HTML that still contains application/ld+json. A room that quietly stops handing an answer engine its structured data now fails the build, which is what the single-room version of this test could not do.",
};
