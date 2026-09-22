# Recorded shapes of the six public count routes

Captured from production on 2026-09-21 with `Accept: application/json`
and trimmed for size (months and surfaces cut short, the signed
`latest` snapshot on the corpus index reduced to its shape). They are
shapes, not figures: `test/published-counts.spec.ts` walks every
numeric leaf in them so a field the empty test environment never
serves — a rail split, a net-by-chain month, a correction — still has
to have a row in `src/store/published-counts.ts`. Re-capture when a
route gains a field the suite cannot produce.
