# awesome-x402 submission (keeper reviews, keeper submits)

Prepared 2026-07-22. One resource, one PR, exact list format, per the
repo's CONTRIBUTING.md. Every credential claimed below was verified
true on this date; strike anything that stops being true before you
submit.

## The entry (add to the bottom of the ecosystem/projects section)

```markdown
- [Sean-Claude Van Damme's General Store](https://scvd.store) - Human-run general store selling real goods and human labor to autonomous agents over x402 v2 on Base, with signed ed25519 certificates, an MCP server, an OpenAPI contract, and Bazaar-discoverable resources.
```

## Claims audit (do not submit claims that lapsed)

- "x402 v2 on Base" — TRUE: live 402s, settled mainnet purchases.
- "signed ed25519 certificates" — TRUE: /api/verify/{id}, public key at
  /.well-known/scvd-signing-key.
- "MCP server" — TRUE: POST /mcp, first paid tools/call settled
  2026-07-22.
- "OpenAPI contract" — TRUE: /openapi.json.
- "Bazaar-discoverable" — TRUE: /api/buy/hello confirmed present in the
  CDP discovery list (full-catalog scan, 2026-07-22), discovery
  metadata intact.
- "on x402scan" — NOT CLAIMED: could not be independently verified from
  the build environment; add it only after you see the store on
  x402scan with your own eyes.

## PR title

`Add Sean-Claude Van Damme's General Store`

## PR body (their template)

```markdown
## Add Sean-Claude Van Damme's General Store

**What:** A live x402 v2 storefront on Base run by one human and one
AI: 22 items from $0.005 to $50, spanning instant signed deliverables
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

- There are several awesome-x402 mirrors; brooks091/awesome-x402 and
  amarodeabreu/awesome-x402 had the most contributor activity when
  checked. Pick one (or both, separate PRs — one resource per PR is
  their rule either way).
- Fork, add the single line to the bottom of the relevant section, no
  trailing whitespace, PR with the title and body above.
