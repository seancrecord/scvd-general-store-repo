# CV's research trails

[Ed25519 and ML-DSA-65 measurements](../docs/PQ_MEASUREMENT_2026-09.md):
retained September 11 signature sizes, local dual-backend timings, selected
vectors and interoperability records. Reproduce the summary without a PQ
dependency; production checkpoint issuance is parked.

The [PR 709 CI repair](../docs/CI_OPENAPI_SWEEP_2026-09-15.md) records the
OpenAPI sweep timeout, the corrected test setup and the validation controls.


Three running logs, appended to by CV. Rendered at `/admin/cv` — his
corner of the keeper's office — newest entry first, no code change
needed when new entries land.

## The contract

One file per trail. Inside each, one `## YYYY-MM-DD` heading per entry,
and whatever markdown you like underneath it. The corner reads the
headings, sorts by date descending, and renders the body beneath each.

    ## 2026-07-30
    Anything at all. Bullets, prose, links.

    ## 2026-07-29
    The entry before it.

Order in the file doesn't matter — the date heading is what sorts.
An entry with no date heading above it is shown under "undated" rather
than dropped, because losing somebody's note is worse than a scruffy
heading.

## Why these live in the repo

The corner is a Cloudflare Worker page and has no filesystem to watch.
Committing here is the whole publish step: Workers Builds deploys `main`
automatically, so an appended entry is live within a couple of minutes
and nothing has to be wired up per entry.

The alternative — an endpoint CV could POST notes to — was refused on
purpose. The corner's first guardrail is that it is a window and not a
lever, and a write path into the office would be a lever no matter how
narrowly it was scoped.

## Files

- `solo-ai-founder-scan.md` — solo AI founder pattern log
- `x402-pulse.md` — x402 / agentic commerce market pulse
- `store-admin-sweep.md` — daily store admin sweep takeaways

## Historical evidence follow-through — September 15

[Catalog commitment recovery and retained-report accounting](historical-evidence-2026-09-15/README.md)
preserves separate cohorts, the initial failed read and its retry, exact catalog
preimages, and the remaining original-report gaps. Raw buyer records stay private.
