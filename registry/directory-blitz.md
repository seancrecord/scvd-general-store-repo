# THE DIRECTORY BLITZ — every venue worth a listing, one page

Surveyed 2026-07-23. Keeper's word: "don't mind just blasting out
everywhere." Doctrine still applies per DISTRIBUTION.md: as ourselves,
once per venue, never bump, free listings only, nothing that wants a
token or credentials. Every prober that starts hitting the store gets
its UA added to the infrastructure classifier so the books stay honest
(watch /admin window-shoppers after each submission).

## Already standing (no action)

- **x402 Bazaar (Coinbase CDP)** — listed automatically at first settle;
  every buy route carries discovery extensions.
- **x402scan** — passive: indexes /.well-known/x402(.json), which we
  serve. "On x402scan" stays unclaimed until seen.
- **ClawHub** — scvd-general-store, republish to 2.0.0 pending keeper.
- **awesome-x402** — PR submitted 2026-07-22, awaiting their maintainers.
- **Agentic.market** — draft ready, GATED by the keeper's own rule until
  organic mcp + bazaar settles both show in /admin.

## Submit now (keeper hands, ~15 minutes total)

### 1. nohumans.directory — curl POST (command already in hand)
Probes every 15 min; verified after 3 passes; on-chain-proven buyer
reports. SAVE THE claim_token FROM THE RESPONSE — shown once, it is
the only edit key. After verification, the badge at
`https://nohumans.directory/badge/{id}.svg` can hang in the README.

### 2. x402scout.com — free form or POST /register
"Canonical registry, trust scores 0-100, MCP-native, rescans every 6h."
Form on the homepage: Service URL `https://scvd.store/api/buy/hello`,
Category: closest fit (their list: Agent/Compute/Data/.../Utility/Other
— "Other" is honest), Name: Sean-Claude Van Damme's General Store.
Free; scanned within 6 hours.

### 3. x402-list.com — check first, then /submit or claim
They AUTO-IMPORT from the Bazaar and x402scan, so the store may already
be in as `imported:bazaar`. Search the directory for "scvd" or
"Van Damme" first:
- If present as imported: claim it via the owner-update flow at
  `/services/{slug}/update` (an imported listing is not an operator
  endorsement until claimed).
- If absent: submit at https://x402-list.com/submit.

### 4. agent-tools.cloud — verify presence, self-submit if absent
Aggregates x402scan, awesome-x402, CDP Bazaar + self-submissions;
20k+ entries, liveness-probed, refreshed every 6h. The store likely
flows in from the Bazaar on its own; check their x402 directory for
scvd.store, use the provider self-submission only if missing.

## VERIFY before touching (MCP registries)

The store's MCP door is a streamable-HTTP endpoint without a server
card (SEP-2127 is still a draft; the store skipped the card on
purpose). The official MCP Registry, Smithery, and PulseMCP each have
their own manifest expectations — verify each one's requirements
against what we actually serve before submitting; do not build a
server card just to get listed unless the keeper decides it's worth it.

## After each submission

1. Watch /admin window-shoppers for the venue's prober UA; report it so
   the infrastructure classifier learns it (keeps organic 402 counts
   honest — nohumans probes every 15 min, x402scout every 6h, x402-list
   monitors uptime continuously).
2. One line in PROJECT_LOG with the date and any claim tokens' location
   (tokens themselves go in the back office, never this repo).
3. The ?src= venue-marker table in /admin shows which papers pull.
