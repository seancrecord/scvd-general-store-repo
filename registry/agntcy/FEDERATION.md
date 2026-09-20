# SCVD federation preparation — September 18, 2026

Status: researched, not deployed. [Maintainer answer](https://github.com/agntcy/dir/discussions/455#discussioncomment-18505900): the shared testbed is read-only; publishing requires our own node in federation mode. An OIDC login is not publisher admission.

## Keeper decision — September 18

The keeper declined recurring/monthly fees for distribution and hosting. Do not provision paid federation infrastructure. No cloud resources have been created. The deployment scope and price comparison below are retained as dated research, not an open spending decision.

Current route: await Anro's free external-ingestion answer. OASF remains publicly served and linked from ERC-8004 meanwhile. A third-party operator importing our record would need its own explicit agreement; no such arrangement is established.

## Deployment scope

The [production guide](https://dir.agntcy.org/latest/dir/dir-prod-deployment/) uses Kubernetes, SPIRE workload identity, a Directory API/reconciler, PostgreSQL and a Zot OCI registry. Storage must persist across restarts. Its reference network exposes HTTPS and peer-routing TCP 5555; the Directory API needs TLS passthrough for mutual authentication. This is separate server infrastructure, not another route on the existing Worker.

The [federation guide](https://dir.agntcy.org/latest/dir/dir-federation-setup/) requires public API, registry, identity-bundle and identity-discovery endpoints plus certificates. Use the `https_web` federation profile with the public peer. Its example embeds older release numbers and demonstration credentials; neither is a deployment-ready SCVD configuration. Pin and validate the current chart and image versions when a host is selected, and provision fresh credentials outside this repository.

The production guide is an AWS EKS reference, not evidence that AWS is the only possible host or that a quoted per-component resource range is the total node requirement. The planning comparison below prices a candidate host, not a qualified deployment. Confirm total capacity and all selected services before provisioning.

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

[Anro's discovery documentation](https://anroagents.com/docs/agent-discovery/) describes domain manifests and paid publication of agents hosted by Anro. That does not establish a free external OASF submission API. Our publisher lookup still returned zero entries after the maintainer answer. The authorized support request was sent September 18 from sean@recordcreativeco.com to support@anroagents.com, asking whether SCVD's existing manifest can be crawled without moving hosting. Gmail confirmed Message sent and the Sent readback. [Sanitized receipt](../../research/erc8004-followthrough-2026-09-18/anro-contact-receipt.json). Await the operator's answer; do not resend.


## Historical planning comparison — paid route declined September 18

| Candidate | Published price and arithmetic | Limit of this estimate |
| --- | --- | --- |
| Single DigitalOcean Basic VM, 4 vCPU / 8 GiB RAM / 160 GiB disk | $48/month plus weekly backups at 20%: **$57.60/month**; daily at 30%: **$62.40/month**. | Candidate for a single-node qualification experiment. Capacity, Kubernetes/SPIRE compatibility and recovery have not been tested. One machine is not a highly available deployment. |
| AWS EKS reference architecture | Standard-support control plane is $0.10/hour, or **$73 for 730 hours**, before workers, storage, load balancing, public IPs and traffic. | $73 is a floor for the control plane alone, not a complete quote. |

Sources: [DigitalOcean Basic pricing](https://www.digitalocean.com/pricing/droplets), [backup pricing](https://www.digitalocean.com/pricing/backups), [AWS EKS pricing](https://aws.amazon.com/eks/pricing/). Prices exclude applicable tax, extra storage/traffic, separate off-host exports and maintenance labor. Existing SCVD domain/DNS is assumed; no paid managed database or load balancer is included in the single-VM example. Automatic disk backups do not establish database-consistent recovery; restore testing remains necessary. No provider is selected and nothing has been purchased.

[Anro's separate directory page](https://directory.anroagents.com/) explicitly advertises free publication, with payment only for its agent-building/hosting platform. Its Connect section documents public query/federation endpoints and domain manifests, but no external record-upload or crawl-trigger form was established. Treat the free-listing claim separately from the platform's paid hosting documentation. Our sent email asks for the missing ingestion step. Paid hosting remains declined.

A second documented discovery check, `POST /ard/search` with query `SCVD scvd.store evidence observatory x402` and `federation: "none"`, also returned an empty `results` array. This is a dated negative result for that query, alongside the exact publisher filter; it is not evidence that the registry's crawler attempted or rejected our manifest.
