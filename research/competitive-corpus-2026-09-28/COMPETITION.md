# Which job gives someone a reason to choose SCVD?

September 28, 2026. Internal decision document; proposed public copy has not
been published. Primary-source inspection, not a paid runtime benchmark.
Revisions, retrieval dates and content hashes are in [sources.json](sources.json);
current registry versions and licenses are in [package-versions.json](package-versions.json).
SCVD prices and evidence contracts were captured from its live menu in
[scvd-offers.json](scvd-offers.json). Re-read prices before an offer.

The strongest supported pitch is a dated observation someone can reuse in a
listing, repair, support or payment investigation. Broad protocol coverage
alone does not establish superiority. Official tooling already solves many
integration jobs, and some alternatives produce useful reports too.

## Job-by-job choice

| Job | Existing alternative and documented output | SCVD contribution | Choose the alternative when… | Choose SCVD when… |
| --- | --- | --- | --- | --- |
| Build an x402 payment client/server | [Official x402 SDKs](https://github.com/x402-foundation/x402): payment integration across supported implementations | JavaScript/Python/Go preflight clients expose SCVD observations; they do not replace payment SDKs | You need to implement, sign, submit or settle payments | You need a separate public-endpoint reading before your own payment decision |
| Verify a signed offer or receipt | [Official extension exports](https://github.com/x402-foundation/x402/blob/a9955ae5538e5531557405091910136a2a2864c8/typescript/packages/extensions/src/offer-receipt/index.ts) include JWS and EIP-712 signature helpers and offer/receipt matching | [x402-verify](../../verifier/README.md) offers a small Ed25519 verifier with explicit unsupported/unavailable states and SCVD evidence-bundle support | You need the extension's broader formats or its integration helpers | You need its supported Ed25519 profile or to verify/export SCVD artifacts; resource authorization still needs separate evidence |
| Validate an MPP deployment or complete a payment flow | [mppx](https://github.com/wevm/mppx/blob/42e9b8f6e677f894d275392b75bc31db272ffa6f/CHANGELOG.md) documents challenge validation, discovery, structured output and payment testing. [MPP Inspector](https://github.com/amgb20/MPP-Inspector/blob/648d61abdd3046b2132e61ab3744517faf52c949/README.md) documents inspection/validation; its full flow command is marked Preview | SCVD's endpoint inspection exposes observed protocol choices and gaps; dated corpus rows can preserve MPP alongside x402 | You need native SDK integration, method-specific payment execution or local debugging | You need an external observation or historical evidence alongside your native validator; SCVD's unpaid reading is not a full MPP transaction test |
| Debug an A2A agent / qualify protocol behavior | [A2A Inspector](https://github.com/a2aproject/a2a-inspector/blob/8aa064639af106ff771d60428ef6d460f5454743/README.md) offers card checks, interactive messages and raw communication; [TCK](https://github.com/a2aproject/a2a-tck/blob/263b9cfaf16a554bdfb166a7ba5b67716e946349/README.md) documents gRPC, JSON-RPC and HTTP+JSON tests with machine/HTML/JUnit reports | [SCVD's A2A desk](https://scvd.store/a2a-desk) offers a free card check and a separately authorized, bounded repair-kit path, dated signed reports and card observations | You need interactive debugging or the TCK's broader transport/conformance suite | You want the desk's supported repair workflow and reusable dated evidence; check its declared protocol/runtime scope first |
| Debug an MCP server | [MCP Inspector](https://github.com/modelcontextprotocol/inspector/blob/1e31c78fbf81a989e8eb47021c6281d7876ad7fd/README.md) provides interactive inspection and CLI operations | SCVD exposes evidence tools through MCP; transport availability is not itself an MCP implementation validator | You need to inspect your own MCP server | You want to call SCVD's verification/readiness tools from an MCP client |
| Make an endpoint eligible for directory discovery | [x402scan discovery](https://github.com/Merit-Systems/x402scan/blob/131a5d3ca9f71f145b6da4a40334c0b52544194c/docs/DISCOVERY.md) specifies discovery precedence, method-aware probing, validation and registration reasons | SCVD provides historical observations and recorded catalog/challenge comparisons | You need to satisfy that directory's current acceptance rules | You need evidence explaining a discrepancy over time or across surfaces. A SCVD reading does not override the directory's decision |
| Study readiness history or attach dated evidence to a listing | Directories and operators' own monitors are substitutes; their export/history guarantees were not exhaustively assessed here | Signed source snapshots, an unsigned reusable table, source pointers, a corpus client and bounded paid watches | A directory's own current listing or internal telemetry already answers the decision | The decision needs a separately attributable observation, dated history and explicit missing coverage |
| Determine whether a named transaction settled | A chain RPC/explorer provides primary chain data; the seller/facilitator can provide its own response | SCVD settlement attestation records the scoped chain reading and its binding limits | You can query and preserve the chain evidence yourself | You need SCVD's portable signed observation. Delivery and a specific request binding are not automatically established |

The UCP question requires its own eligibility boundary: exposing SCVD's merchant
profile/catalog does not establish a general third-party UCP validator. Do not
promote a UCP-validation claim from checkout support alone.

## Cost and setup boundaries

Official libraries and self-run inspectors can be used without buying an SCVD
report; hosting, engineering time, RPC and payment costs remain the user's.
This review did not price their managed offerings or perform spending tests.
Registry metadata confirms MIT for mppx and @agentcash/discovery, and Apache-2.0
for @x402/extensions. A code license is not a promise of free hosted service.

SCVD's public reads, corpus and library paths are available without a purchase.
The captured menu lists service_audit and conformance_watch at 5 USDC each,
the latter for seven days; a2a_repair_kit at 49 USDC;
settlement_attestation at 0.004 USDC and research_comparison at 0.01 USDC.
Those are different outputs, not a price comparison with an equivalent test
suite. The live item contract is authoritative.

## Competitive structure and priority

**Direct overlap:** MPP Inspector for inspection, directory observation services
for endpoint evidence, and A2A repair/check products where their scope overlaps.
**Substitutes:** official SDKs, inspectors/TCKs, operator logs and direct chain
reads. **Adjacent threats and prospective partners:** protocol maintainers,
facilitators, directories and agent runtimes that can bundle these checks.
x402.watch is retained as an unresolved adjacent candidate: its fetched docs
were an application shell, insufficient for a defensible feature comparison.
No lack-of-history or lack-of-signature claim is made about it.

The most consequential pressure is substitution by existing free developer
tools: **high**, based on the documented validation and reporting above.
Distribution dependence is **high** for a strategy relying on third-party
directories and answer engines. Entry pressure for a one-shot checker is
**high** given reusable public SDKs; reproducing an established dated archive
is a different task. Buyer bargaining power and rivalry intensity are
**unmeasured**: no audited customer concentration, switching cost, market size,
cost base or competitor revenue evidence was collected. These are qualitative
judgments; invented capability scores would obscure the unknowns.

The fastest visible capability movement in this sample is native SDK validation
and payment tooling. The mppx changelog is concrete evidence of that expansion;
SCVD should compete on decision-useful evidence and compatibility, not the
mere existence of a checker. No claim about competitor hiring, financing or
12-month budgets is supported by this read.

## Three working hypotheses

1. **Protocol maintainers bundle the common checks.** Their code already spans
   integration and validation. Likely incentive: reduce developer friction.
   Response: make SCVD artifacts easy to consume after a native tool reports a
   result. A verified signature alone is insufficient differentiation.
2. **Directories can absorb one-shot readiness.** Merit's registration process
   already probes and validates. Likely incentive: accurate, invocable listings.
   Response: offer a dated discrepancy record or history that helps resolve a
   real listing decision, using the existing technical discussion.
3. **Official A2A tooling remains the default developer reference.** Inspector
   and TCK cover different development tasks. Likely incentive: protocol
   interoperability. Response: state exactly which repair and evidence workflow
   SCVD supplies, and point people to TCK when its coverage is what they need.

These are planning hypotheses inferred from capabilities, not announced plans.
The archive's value depends on useful, fresh, comparable readings and adoption;
its age and download count alone do not establish a competitive advantage.

## Proposed response playbook

Likelihood/impact below are qualitative planning estimates, not measured odds.
Actions remain proposals; this document starts no monitor or external campaign.

| Possible move | Likelihood / impact | Observable trigger | Response using existing assets |
| --- | --- | --- | --- |
| Native SDK expands validation coverage | High / high | Release documents the same check SCVD promotes | Update that job's comparison at the next release review; retain the historical/evidence use case and remove unsupported superiority copy |
| Directory adds durable signed history/export | Medium / high | Public export with retrievable dated rows and stated signature semantics | Compare evidence contracts on the same example; offer compatibility or an independent second reading where it changes a decision |
| TCK/Inspector adds repair guidance and reusable reports | Medium / high | Documented supported workflow overlaps SCVD's paid kit | Reassess the kit's actual scope, labor and price; compete only on demonstrated additional work |
| Agent runtime bundles preflight | Medium / high | Runtime exposes a public payment-preflight interface | Prepare an adapter/example from existing SDKs if its contract fits; avoid duplicating the runtime's baseline checks |
| Partner values a clean report more than defect volume | Medium / medium | Reviewer names a decision and requests another reading | Supply the scoped clean evidence with its gaps; record use and repeat requests separately from payment |

## What to do with this comparison

First priority: the corpus-backed catalog-agreement package in
[PARTNER_PACKET.md](PARTNER_PACKET.md). It addresses a directory decision with
actual source rows. Second: strengthen the path from preflight results to dated
history and verification in the existing package docs. Public comparison copy
should say when to choose the official alternative as plainly as when to use
SCVD. No new category, generic superiority claim or duplicate page tree is needed.
