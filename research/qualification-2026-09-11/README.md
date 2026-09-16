# Retained PQ measurements — September 11, 2026

This directory publishes the PQ subset of the qualification records from
experiment commit `816481c7c5118c6e932f8bb109febf9981c0502c`, unchanged.
It does not import that branch's screening, backup or checkpoint implementation.

- `pq-runtime.json`: raw local samples and recorded source/dependency hashes.
- `pq-interop.json`: public signatures, keys and cross-implementation verdicts.
- `pq-acvp.json`: selected NIST cases, exclusions and the pinned input manifest.

Read [the report](../../docs/PQ_MEASUREMENT_2026-09.md) first. The
[summary](../pq-measurement-2026-09-14/summary.json) is a compact derivation,
not a new benchmark. From the repository root:

```sh
node research/pq-measurement-2026-09-14/verify-summary.mjs
```

This checks record consistency using Node built-ins. It does not authenticate
the recording host or independently replay signature verification. The report
and experiment README explain separate reproduction steps and their limits.
