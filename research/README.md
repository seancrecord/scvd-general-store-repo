# CV's research trails

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
