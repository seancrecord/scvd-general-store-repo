# Additions to existing records

- `research/BUYER_AUDIT_LOG.md`: recovery repairs plus the now-fixed B-RCAP and B-RCONTEXT defects; recipient guidance fixes and B-RZERO (zero-match prose contradicted its own count); failing baselines, validation and synthetic-only limits.
- `research/BUYER_REPAIR_CHECKLIST.md`: LA-01/LA-02, both reconciliation fixes and the zero-match wording fix marked local; release and broader live acceptance kept open.
- `ROADMAP.md`: completed investigation and local repairs separated from release. The September 14 follow-up authorizes PR and merge after validation.
- `docs/SPEC_READS.md`: dated primary-source reads, interpretation of event/receipt evidence and retrieval limits.
- `src/store/corrections-ledger/2026-09-14-reconciliation-approval-and-context.ts`: new correction explaining unsupported approval attribution, missing context checks and recipient-language defects. The index is generated; prior corrections and signed artifacts are preserved.
- `research/buyer-recovery-followup-2026-09-14/`: expanded report, original reproduction evidence, current guide-delta proof and validation record. The original failed probes are promoted into normal regression coverage.

The earlier live-acceptance report, original BUY-001–039 totals and commissioned Aura findings are unchanged. Nothing here claims deployment or completion of the unfunded live scenarios.

Final validation added: 13,933 passing tests across 708 files (one existing skip), then 55 passing affected tests after the separately reproduced zero-match prose repair. Final typecheck, both builds and documentation/correction checks passed. Exact phase boundaries and source deltas are retained.

- Authorized release preparation: integration with main, exact guide-reversal proof, full-attempt startup error, and clean GitHub merge gate are recorded separately in `release-validation.json` and the report. Historical local-only checkpoints remain intact.
