# Python client access — October 7, 2026

The Python access block is repaired in Cloudflare. With the keeper's
explicit approval of the broader scope, a configuration rule disables
**Browser Integrity Check only** at the exact hostname `scvd.store`,
excluding every path whose lowercase form starts with `/admin`.

Rule: `Public agent access — browser integrity exception`.
Cloudflare rule ID: `5b915cf0bcda4e26aa092d28b8078ce8`.
The dashboard showed it **Active** after deployment on October 7.

```text
(http.host eq "scvd.store" and not starts_with(lower(http.request.uri.path), "/admin"))
```

Only the Browser Integrity Check setting is configured, with value off.
Zone-wide Browser Integrity Check remains on. Bot Fight Mode was already
off. No application code was deployed and no payment or authentication
setting was changed. The rule can be disabled in Cloudflare Configuration
Rules to roll back this exception.

## Evidence

At 00:50 UTC, the same HTTP client received 200 from `/llms.txt` with
`node`, an absent user-agent, `Googlebot`, `GPTBot`, and `PerplexityBot`,
and 403 with `Python-urllib/3.11`. The response body was `error code: 1010`.
Real Python 3.13 urllib, with its default headers and normal TLS validation,
also received 403/1010 on all five discovery documents.

After deployment, at 16:14 UTC, all six header probes received 200 with
the text document. Real Python urllib received 200 for both GET and HEAD
on all five documents. These are observations from the probing machine,
not evidence of access from the named crawlers' own infrastructure.

Captured results:

- [Before: header probes](client-access/2026-10-07/header-probes-before.json)
- [Before: real Python](client-access/2026-10-07/python-before.json)
- [After: real Python GET and HEAD](client-access/2026-10-07/python-after.json)
- [Scope controls](client-access/2026-10-07/scope-controls.json)

The initial fix covered only GET/HEAD on those five documents. Its scope
controls still returned 403 on the homepage and `POST /mcp` for Python.
Automatic approval review initially rejected the broader non-admin scope;
the keeper then explicitly approved it, conditional on checking for adverse
effects. The existing rule was updated in place, not duplicated.

At 16:31 UTC, after that update, real Python urllib received 200 from the
homepage, all five documents and `POST /mcp` with a valid `tools/list`
result. An unpaid request to `/api/buy/spot_check` (selected from the live
OpenAPI document) returned 402 with a valid x402 v2 payment challenge.
No payment was supplied and nothing was purchased.

Both before and after the extension, `/admin` returned 401 to the ordinary
client and 403 to Python, and `/.env` returned 403 to both clients.
Only the BIC setting changed; other WAF rules, rate limits, authentication
and payment checks were not modified. These spot checks found no regression,
but do not guarantee no adverse effects. Requests previously rejected only
by BIC can now reach public handlers; longer-term traffic and cost effects
are unmeasured.

- [Before the public-route extension](client-access/2026-10-07/public-routes-before.json)
- [After: public routes and security controls](client-access/2026-10-07/public-routes-after.json)

Cloudflare's [1010 explanation](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/)
identifies browser-signature blocking and points to Browser Integrity
Check. Its [BIC documentation](https://developers.cloudflare.com/waf/tools/browser-integrity-check/)
documents scoped configuration rules.

## Recurrence check

`npm run doors:check` now probes `/llms.txt` with all six header cases.
`npm run doors:check -- --clients-only` runs just this small read-only
matrix. It returns 1 for an observed block or non-document response,
2 for incomplete evidence, and 0 when every probe receives the text.
The full checker fails for a blocked client even before a new baseline
is recorded. No existing baseline or human review date was changed.

The collector really omits the absent-user-agent header, preserves
redirects as responses rather than silently following them, bounds request
time and response size, and records Cloudflare Ray IDs. These remain
header probes using Node HTTP; real Python was tested separately above.

Validation: the regression test failed before the reader was changed;
all 55 door tests then passed, including a local server that blocks only
the Python header and a stalled server that must remain unknown.
`npm run typecheck` passed. `npm run build:check` completed all dry-run
bundles, with sandbox warnings about writing Wrangler's external log
directory. No baseline or human review date was recorded. The Cloudflare
repair required no application deployment; the follow-up PR adds the
regression check and preserves these observations.
