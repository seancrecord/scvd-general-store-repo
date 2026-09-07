# Paid recovery storage prerequisite

The buyer-recovery preview failed during `npx wrangler versions upload` on 2026-09-06 at 19:45 UTC. Cloudflare returned error **10211**: the version includes a Durable Object migration, which requires a non-versioned deployment. Dependency installation and bundling succeeded. The npm install-script warnings were not the failure.

This prerequisite adds the `PaidRecoveryStore` class, its `PAID_RECOVERIES` binding and the additive `v2-paid-recovery` SQLite migration. It includes the coordinator's tested implementation but no purchase-route consumer. Existing buyer behavior remains main's behavior. No migration deletes, renames or transfers existing storage.

Release order:

1. Merge this storage prerequisite through the normal required GitHub CI gate. Its Cloudflare preview upload is expected to report 10211 while the namespace is absent; preview status is not a required repository check. Do not change the preview command to deploy branches to production.
2. Let main's normal `wrangler deploy` apply `v2-paid-recovery`. Confirm the production build succeeded and the class exists before calling the bootstrap complete. A merge alone does not establish that provisioning succeeded.
3. Bring main into the buyer-recovery branch and rerun its preview build. Keep the migration history; removing the declaration is not a migration fix.
4. The consumer preview can use the provisioned class. Keep its PR draft until its own remaining implementation and checks are ready.

This resolves the deployment-order prerequisite; it does not close BUY-037 or any other buyer-recovery finding. Interrupted partial writes and legacy purchases without a full input binding remain open.

Local validation for this slice: typecheck, coordinator tests and both Worker dry-run bundles. The full suite runs on GitHub as requested. The dry run cannot prove namespace provisioning or preview upload success against the live account.

Reference: https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/

Rollout update: #542 merged at 2026-09-06 22:02 UTC (`e00307bd`). The main Worker build succeeded as `27b2be72-f149-4bae-b243-38c0a12e33bd`, version `6c3ac7a3-4ce7-4f9d-88e2-84e169f32673`. The recovery branch incorporates main through `4f086c26`, preserving both input-contract and recovery checklist entries. Typecheck, 153 focused tests across seven files, and both dry-run builds passed. Consumer preview success is still checked separately.
