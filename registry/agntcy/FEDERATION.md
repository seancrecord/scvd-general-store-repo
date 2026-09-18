# SCVD federation preparation — September 18, 2026

Status: researched, not deployed. [Maintainer answer](https://github.com/agntcy/dir/discussions/455#discussioncomment-18505900): the shared testbed is read-only; publishing requires our own node in federation mode. An OIDC login is not publisher admission.

## Decision in front of the keeper

Operating a Directory node adds a persistent service beside the store. The immediate decision is whether that ongoing operation is justified for SCVD's discovery. No hosting provider, monthly budget, permanent trust domain or DNS names have been approved. No cloud resources have been created.

Recommendation: pursue Anro's external-ingestion answer first while deciding whether federation has value beyond this listing. OASF remains publicly served and linked from ERC-8004 meanwhile. A third-party operator importing our record would need its own explicit agreement; no such arrangement is established.

## Deployment scope

The [production guide](https://dir.agntcy.org/latest/dir/dir-prod-deployment/) uses Kubernetes, SPIRE workload identity, a Directory API/reconciler, PostgreSQL and a Zot OCI registry. Storage must persist across restarts. Its reference network exposes HTTPS and peer-routing TCP 5555; the Directory API needs TLS passthrough for mutual authentication. This is separate server infrastructure, not another route on the existing Worker.

The [federation guide](https://dir.agntcy.org/latest/dir/dir-federation-setup/) requires public API, registry, identity-bundle and identity-discovery endpoints plus certificates. Use the `https_web` federation profile with the public peer. Its example embeds older release numbers and demonstration credentials; neither is a deployment-ready SCVD configuration. Pin and validate the current chart and image versions when a host is selected, and provision fresh credentials outside this repository.

The production guide is an AWS EKS reference, not evidence that AWS is the only possible host or that a quoted per-component resource range is the total node requirement. No monthly cost estimate is claimed. Obtain a provider-specific estimate including compute, storage, networking and backups before provisioning.

The local shell currently exposes `dirctl`, but did not find `docker`, `kubectl` or `helm` on PATH. This observation does not establish whether a remote cluster exists. The historical local signing receipt does not establish an operating public node.

## Admission packet after hosting is selected

1. Choose the permanent SPIRE trust domain and public hostnames. The documented trust-domain identity cannot be changed in place later.
2. Deploy the node and verify public certificates, storage recovery, API identity and routing reachability from outside its network.
3. Create `onboarding/federation/<approved-trust-domain>.yaml` from the upstream template in [agntcy/dir-staging](https://github.com/agntcy/dir-staging/tree/main/onboarding/federation). It identifies the trust domain, live bundle endpoint and `https_web` profile. Do not submit placeholder endpoints.
4. Submit that federation PR and obtain reciprocal trust/authorization from maintainers. Our node trusting theirs is only half of the relationship.
5. Re-cut and validate SCVD's record from its source. Push it to our node, have the keeper sign the exact current CID with the separate record-signing key, then verify signature and domain ownership.
6. Publish routing labels and have a second participant retrieve the same CID and find it by name, skills, domains and MCP module. Check scan status and a dry-run installation separately.
7. Change the ERC-8004 OASF pointer only after immutable retrieval works. Keep a dated receipt for every claim; a local push or accepted federation PR alone does not prove Cisco catalog visibility.

Maintainer onboarding is documented in [the public staging instructions](https://github.com/agntcy/dir-staging/blob/main/onboarding/README.md), which explicitly offer no SLA or persistence guarantee for that shared environment. It is not SCVD's backup.

## Anro remains a separate route

[Anro's discovery documentation](https://anroagents.com/docs/agent-discovery/) describes domain manifests and paid publication of agents hosted by Anro. That does not establish a free external OASF submission API. Our publisher lookup still returned zero entries after the maintainer answer. The prepared support request asks whether SCVD's existing manifest can be crawled without moving hosting; it remains unsent pending explicit email authorization.
