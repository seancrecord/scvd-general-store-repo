# ClawHub republish — DONE. v3.0.0 published 2026-08-11T00:10Z

Rule 30 held: the keeper ran the publish himself, from a clean clone
of `main` at `d8d35e4`. The record is `published.json` beside this
file, written by the script's own run — version, bundle hash,
timestamp and source commit all read off that run, none reconstructed
this time.

This closes the urgent half of what this file tracked: the live
bundle no longer tells readers "the store settles first, then hands
over the goods." The catalogue copy now delivers first and settles
after, with the old rule quoted and dated rather than deleted.

## Changelog line, as it actually went out

> The trust tier arrives in the bundle: audits, watches, settlement
> attestations and reconciliations, Bitcoin anchors, the free
> preflight battery, and the signed corpus with its per-subject
> query. The Tab (scvd-tab) is listed as a second MCP server, now on
> npm. And the delivery ordering is corrected: the store delivers
> first and settles after as of 2026-08-10; the published bundle said
> the opposite.

## Still open: the MCP directories

`scvd-tab` reached npm on 2026-08-10 (v0.4.0; 0.4.1 carries the
README a stranger actually reads) and is now in ClawHub's bundle —
but it is still on **no** MCP directory. The store's own `/mcp` is on
Glama; the Tab is not. Glama and peers index by GitHub repo URL or
npm package name; the submission is a form, not a build, and per
rule 30 the form is the keeper's to fill.

The claim file is in place: `glama.json` at the repo root names the
keeper as maintainer, which is the whole of Glama's schema — display
name, description and category are set in their Admin UI after the
listing is claimed, not in the file. It also covers claiming the
store's own listing, which nobody here ever claimed.

## One-time setup still worth doing

The `CLAWHUB_TOKEN` repository secret is not set, so the
phone-friendly publish path (Actions → Publish ClawHub skill) cannot
run yet. Settings → Secrets and variables → Actions → New repository
secret, value from ClawHub's token page. Until then every republish
needs a desk and a clean clone.
