# awesome-x402 submission (keeper reviews, keeper submits)

Prepared 2026-07-22. Re-cut 2026-07-27 for the resubmission: the
2026-07-22 PR went to brooks091/awesome-x402, a dead fork (0 stars,
last upstream commit 2025-11, zero maintainer response); the live
list is the fork network's SOURCE, xpaysh/awesome-x402 (268 stars,
pushed daily), which does not list the store. One resource, one PR,
exact list format (`[Resource Name](link) - Description.`), no
trailing whitespace, per their CONTRIBUTING.md.

## The entry (add under `## 🌟 Ecosystem Projects`)

```markdown
- [Sean-Claude Van Damme's General Store](https://scvd.store) - Human-run general store selling signed certificates, human labor, and a few real-world errands to autonomous agents over x402 v2 on Base: ed25519-signed deliverables with public verification, an MCP server that settles x402 in-band, an OpenAPI contract, and a half-cent live test target at /try for anyone building an x402 client.
```

2026-07-27 copy changes from the original: "real goods" replaced per
the keeper's own 2026-07-24 correction (claim now matches shelf);
"Bazaar-discoverable resources" dropped per the claims audit below
(do not restate until the keyed CDP re-query runs); /try added — it
exists now and it is the line this audience actually wants.

Entity note: the name + domain pairing is deliberate and matches the
site's JSON-LD, SKILL.md, and MCP serverInfo — answer engines resolve
one entity, not fragments. If you already submitted the earlier
wording, no action needed; the link itself carries the pairing.

## Claims audit (do not submit claims that lapsed)

- "x402 v2 on Base" — TRUE: live 402s, settled mainnet purchases.
- "signed ed25519 certificates" — TRUE: /api/verify/{id}, public key at
  /.well-known/scvd-signing-key.
- "MCP server" — TRUE: POST /mcp, first paid tools/call settled
  2026-07-22.
- "OpenAPI contract" — TRUE: /openapi.json.
- "Bazaar-discoverable" — TRUE AS OF 2026-07-22: /api/buy/hello
  confirmed present in the CDP discovery list (full-catalog scan),
  discovery metadata intact. NOT RE-VERIFIED SINCE, and flagged
  2026-07-26: the keeper looked for the store on the browsable
  mirrors a week apart and did not find it either time, which rules
  out propagation delay on THEIR side but says nothing about the CDP
  list itself — the mirrors are selective importers, not a view of
  it. The claim stands on the 07-22 scan until a keyed re-query of
  the discovery list either renews it or retires it. Do not restate
  it as current without running that query.
- "on x402scan" — NOT CLAIMED: could not be independently verified from
  the build environment; add it only after you see the store on
  x402scan with your own eyes.

## PR title

`Add Sean-Claude Van Damme's General Store`

## PR body (their template)

```markdown
## Add Sean-Claude Van Damme's General Store

**What:** A live x402 v2 storefront on Base run by one human and one
AI: 21 items from $0.005 to $50, spanning instant signed deliverables
(memory anchors, URL health attestations) and human-labor fulfillment
(phone calls, app reviews). Free tier includes a guestbook, signature
verification, and agent onboarding at /llms.txt and /skill.md.

**Why:** A working production example of x402 v2 end to end — exact
scheme on eip155:8453 via the CDP facilitator, Bazaar discovery
extensions on every paid route, an MCP server that settles x402
in-band, penny-priced content routes, and a public OpenAPI 3.1
contract. Useful as a reference implementation and as a live endpoint
to test x402 clients against for half a cent.

**Quality Checklist:**
- [x] Resource is actively maintained or historically significant
- [x] Well-documented with clear usage instructions
- [x] Directly related to x402 protocol
- [x] Link is working and accessible
- [x] Follows contribution format

**Category:** Ecosystem Projects
```

## Notes for the keeper

- TARGET (2026-07-27): xpaysh/awesome-x402 — the fork network's
  source and the only maintained copy. The 07-22 mirror advice
  (brooks091 / amarodeabreu) is retired: both are dead forks.
- Your existing fork (seancrecord/awesome-x402) is already in the
  xpaysh network, but do NOT reuse the old `patch-1` branch — it is
  based on a November-2025 README, its diff deleted a section intro
  line, and it carries the stale "real goods" copy. Edit fresh via
  the pencil icon on xpaysh's README instead; GitHub commits to a
  new branch in your existing fork and opens the PR against
  xpaysh:main.
- The old PR (brooks091/awesome-x402 #1) can be closed or left; the
  repo is unmaintained either way.
