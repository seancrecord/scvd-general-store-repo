import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-09-09",
  what_was_wrong:
    "The hand-rolling notes called their payment envelope complete while omitting the quoted resource and extensions. The browser checkout omitted them too. Those fields carry discovery metadata: a payment can settle without them and leave the search listing absent or stale. Separately, the attestation bundle's published schema used a nested counted regex that JavaScript accepted but Coinbase's discovery validator rejected.",
  how_long:
    "The browser omission was present from its first implementation on 2026-08-26 until this correction. The notes and bundle schema were found on 2026-09-09. Retained bundle settlement responses from August 19 and 26 reported invalid discovery configuration; those generic historical responses do not establish which field was rejected then.",
  found_by:
    "The keeper's report of repeat purchases still absent from search, followed by free endpoint validation, retained discovery-response and sale-record reads, and reproduction with Go's regex engine.",
  what_changed:
    "The browser echoes the quoted resource and extensions unchanged, and the hand-built-client example shows both fields. The bundle uses a compatible pattern with separate length bounds preserving its two-to-twenty hash limit. CI compiles the published schema patterns with Go, and a browser regression checks the submitted envelope. The free validation script now uses the documented request and distinguishes rejection from an unreadable or failed probe. These repairs do not establish that earlier payments carried metadata or restore existing index entries. The affected recent sale records name custom clients; their retained discovery responses generally contain no Bazaar status, and their submitted envelopes were not retained. No repeat purchase was made during this diagnosis.",
};
