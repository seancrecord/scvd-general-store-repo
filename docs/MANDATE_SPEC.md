# The mandate record, v1

The mandate — what an agent was authorized to do, recorded and signed
by a party that is neither the agent nor its principal, before the
agent acts, citable on every later purchase and counter-signable free
— is written up as a pattern another issuer can implement, typed once
in `src/store/copy/mandate-spec.ts` and served live:

- the spec, as a page and as markdown: https://scvd.store/mandate-spec
- the record's JSON schema: https://scvd.store/schemas/scvd-mandate-v1.json
- the record itself: `src/services/mandates.ts`; the read and
  counter-signature doors: `src/routes/mandate.ts`; the MCP tool:
  `buy_mandate` (`src/lib/mcp-tools.ts`)

This file points rather than restates, so the served page and the
repository cannot come to say different things (rule 45).
