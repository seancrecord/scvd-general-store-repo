# Host-history Markdown suffix — September 20

A public release readback found that `/corpus/host/lionx402.com` returned Markdown
when requested through `Accept`, while `/corpus/host/lionx402.com.md` returned
404. The host route consumed the suffix as part of the hostname and returned its
own missing-host response before the shared Markdown fallback could run.

An unrecorded hostname ending in `.md` now reaches the existing fallback. It
uses the canonical page's Markdown representation and canonical link. A recorded
hostname whose actual domain ends in `.md` keeps its own page; its additional
`.md` suffix reaches its own Markdown representation. Unknown hosts remain 404.
No renderer, signed original, checkout behavior or acceptance budget changes.

The old host-page test could return before asserting anything when its corpus
was empty. It now seeds a dated corpus and must exercise a real page. The seeded
suffix assertions failed with 404 before the routing change. After integrating September 21 main, 40 focused tests across host history and
Markdown routes pass, including genuine `.md` domains, unknown hosts and existing
fallback boundaries. Typecheck, production bundles and documentation checks pass.
Local full-suite attempts stopped before completed test results after repeated
Worker runtime errors, including with fresh lockfile dependencies and no other
suite initially running. Their cause is not established. These attempts are not
a passing full suite; all hosted test shards remain required before merge.

The public baseline was read September 20 at 18:17 UTC: negotiated Markdown
returned 200 (6,003 bytes), suffix access returned JSON 404 (333 bytes). Original
responses and hashes are retained privately under
`research/host-markdown-suffix-20260920.local/`. This discovery is a controller
readback, not a fresh native buyer result. Release still needs a live suffix
readback; a new buyer cohort keeps its separate qualification and freeze.

The first hosted run exposed an existing calendar-sensitive receipt assertion:
this week's signed note contains an apostrophe, which the page correctly escapes.
The test compared unescaped text instead. It failed again locally. The shared
correction from the concurrent acceptance-report task checks this certificate's
actual note in its escaped HTML form, preserving the rendering and signature
behavior. All 47 focused tests across four files and typecheck pass with that
correction. The final head must pass the full hosted suite with that test repair.
