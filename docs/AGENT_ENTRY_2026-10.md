# Agent entry and no-spend rehearsal — October 12, 2026

The keeper asked to open the front door further for Grok, Hermes, ClawHub and
other agents, with clearer descriptions and forward-looking improvements.
This extends the personal-shopper release; it changes no payment mechanism.

## Finding and implementation

A housemarked public read returned HTTP 200 for robots.txt, llms.txt and the
existing agent-skills index, but HTTP 404 for `/.well-known/skills/index.json`.
Hermes's official docs and its WellKnownSkillSource consumer expect the latter.
The new files-based index is generated from the existing catalog, preserving
the digested RFC index. Every listed file resolves from its skill root and is
byte-identical across both paths. Only explicit published files are served.

The first-screen actions now name endpoint checks, receipt checks, watches,
and signed evidence; the shopper handoff links host-specific connection recipes.
The store already has task descriptions, samples and payment-capability rows:
these are reused, rather than replaced with a second product catalog.

## What is forward-looking

The shopper supports a no-spend rehearsal. It returns the intended result,
actual inputs, live quote, observed versus claimed host capabilities, unknowns,
and required approvals. It ends before wallet setup, signing or funding.
A read-only host can therefore leave a useful handoff for a capable host, with
a fresh quote and approval check required at execution. This is instructions
for the buyer's runtime, not a new endpoint or a claim that a wallet was tested.

## Qualification matrix

| Path | Evidence | Still unobserved |
| --- | --- | --- |
| Public HTTP discovery | Live baseline read; local index/file/digest/CORS tests | New production paths until release |
| Skills CLI | Previous GitHub/local install succeeded in disposable directory; new website path requires release readback | Native purchase |
| Hermes | Official consumer format inspected at ff2d02f998f9f9e45543eea30fb935f47e4504a7; contract and files tested locally | Full Hermes host installation, model use and payment |
| ClawHub / OpenClaw | Versioned package and categories prepared; dry-run and public readback tracked in release record | Native purchase; public listing until publication |
| Muse / ChatGPT / Claude / Grok chat | URL-based recipe conditional on actual session tools | Runtime-specific installation and payment |
| xAI crawlers | GrokBot, xAI-Grok, Grok-DeepSearch named in live robots.txt; wildcard also permits access | Official operator identity, successful genuine crawler fetch or indexing |

No bot allow-list or firewall changes were needed for the observed HTTP reads.
A user-agent string is not authenticated crawler identity. Training traffic,
public listing, installation, invocation and settlement are separate evidence.

## Next experiments, not claims or standing jobs

1. A host-to-host rehearsal handoff: let a read-only session prepare a task,
   then let a wallet-enabled host independently re-quote and request approval.
   Measure missing inputs and successful delivery, not generated plans.
2. Consumer-driven discovery checks: run actual installer clients on release
   in temporary directories, record referenced-file completeness and scan results.
3. A dated host compatibility ledger: qualify discovery, install, free call,
   approved purchase and receipt verification separately. A stale entry becomes
   unknown; a directory logo never becomes a compatibility claim.

These experiments use existing checkout and evidence paths. No autonomous
self-purchase, new paid SKU, recurring crawl or unsolicited outreach is enabled.
