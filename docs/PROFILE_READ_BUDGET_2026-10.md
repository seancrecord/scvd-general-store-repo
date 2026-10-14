# Profile index resource use — October 7, 2026

After the R2 retry repair (#977), `/profiles` still intermittently returned
Cloudflare error 1102 / HTTP 503. A successful sampled request used 2,672 ms
CPU and 3,722 ms wall time. The failed request's CPU/memory split was not
captured, so this is evidence of resource pressure, not a proved attribution
to a particular limit.

The index previously loaded effective evidence for every commissioned
profile before filtering expired entries. Concurrent hosts independently
resolved the same corpus pointers and cold R2 objects, parsed the population
register and reconstructed wallet clusters.

The index now excludes expired entries before that work. Active hosts share
read-only corpus, population and wallet inputs inside one explicit async
request scope. No in-flight I/O or decision survives into another request;
individual expired-profile pages remain available. Concurrent scopes and
binding identities are isolated. Existing signed evidence is untouched.

Validation: 48 checks across seven affected suites pass, as do typecheck,
all production bundle checks and the scalability audit. Removing the source
fix makes both new read-budget assertions fail (four archive reads instead
of one, and four instead of zero for an expired-only index). The next-request
freshness control passes both ways. Full CI remains the merge gate.

PR #990 merged October 7 at 18:30:28 UTC after all four test shards and
required checks passed (merge `384978f8da37c63cb041f3152ead8cf6c528eeee`).
Production version `0753c380-44f0-4241-84ef-54e85b88d03c` deployed at
18:31:05 UTC. Two subsequent probes returned 200; the captured request used
523 ms CPU and 1,680 ms wall time, outcome `ok`, no exception. That CPU sample
is about 80% below the earlier 2,672 ms sample. These were separate live
requests, not a controlled benchmark. A short clean sample cannot prove that
an intermittent resource failure is eliminated.
