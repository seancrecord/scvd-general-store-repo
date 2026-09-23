# AGNTCY Directory (`agntcy/`)

House rule 30 applies here as everywhere in this drawer: **publishing
is a queue — the keeper reviews, the keeper submits.** Nothing below
runs on its own, and nothing below signs anything.

**September 17 admission:** [Participation and representation request](https://github.com/agntcy/dir/discussions/455#discussioncomment-18487204) sent on keeper authorization after checking the complete discussion for earlier SCVD requests. Await the access route and feedback; no shared publication or signature/scan badge is claimed.

**September 18 retry:** the current public record passed schema and taxonomy validation. Refreshed OIDC authentication succeeded, but shared-node push still returned `PermissionDenied`. [Follow-up sent](https://github.com/agntcy/dir/discussions/455#discussioncomment-18505236); [dated findings](../../research/distribution-2026-09-18/OASF_FOLLOW_THROUGH.md). No new CID or publication is claimed.

**September 18 maintainer answer:** [the shared testbed is read-only](https://github.com/agntcy/dir/discussions/455#discussioncomment-18505900); publishers must operate their own federated node. Stop treating OIDC writer access as a pending grant. [Infrastructure and admission preparation](FEDERATION.md); no federation deployment is claimed.

## What this is

`record.json` is this store's OASF record: the AGNTCY Agent Directory's
idea of who we are. Directory is not another human-facing listing. It
is a federated registry whose discovery primitive is a **taxonomy** —
routing announcements advertise a content-addressed record plus its
skills, domains and modules, and a consumer matches on those. A record
that is found there can also be *installed* from there: `dirctl
install` writes an MCP server entry and an Agent Skill straight into a
supported coding agent's configuration.

That is why the record is worth keeping true, and why four things in it
are not decoration:

| Field | What it actually buys |
| --- | --- |
| `skills` / `domains` | The only thing network discovery matches on. Prose is for the human who already found us. |
| `modules[integration/mcp].connections` | Both transports. `dirctl install` derives its MCP entry through OASF-SDK's Copilot translator, whose OASF 1.x path **skips every non-stdio connection** — so a record carrying only `https://scvd.store/mcp` is valid, pushable, exportable, and installs as nothing. `scvd-tab` is the install path. |
| `locators[source_code]` | Directory's security reconciler runs its MCP scanner on records that have one. Without it every scanner is *skipped*, and a record with every scanner skipped is not returned by `dirctl search --safe`. |
| `name` | A URL on our own domain, so the record can be name-verified against scvd.store rather than addressed only by CID. See the gap below. |

## How it is written

Never by hand:

```bash
npm run oasf:cut              # writes record.json from src/lib/oasf-record.ts
npm run oasf:taxonomy:check   # network: re-reads the taxonomy from agntcy/oasf
```

`src/lib/oasf-record.ts` is the only definition. The version, the
connections, the tool list, the authors and the source locator are read
from `server.json`, `mcp.json`, `plugin.json` and the live MCP
catalogue, so none of them can drift. `test/oasf-record.spec.ts` fails
when `record.json` is behind the source, and names the cut script.

The one class of value that lives upstream is the OASF taxonomy ids.
Those cannot be derived at build time, so they take the other arm of
AT_SCALE rule 1 — the tool refuses. `npm run oasf:taxonomy:check` reads
every declared row back from `agntcy/oasf` at the pinned tag,
**recomputes** each id from the `uid` of each level rather than trusting
the number in the tree, checks each level's `extends` chain, and exits
non-zero on any disagreement. It is not in `npm test`: a green suite
must not depend on GitHub being up.

A Directory server validates a record's skills against the taxonomy for
the record's **own declared `schema_version`**. An id that is correct
under 1.1.0 and pasted into a 0.8.0 record is rejected — or worse,
silently matches an unrelated class sitting at the same numeric slot.
So `OASF_TAXONOMY_TAG` and `OASF_SCHEMA_VERSION` move together, and the
check asserts exactly that.

It distinguishes its two failures on purpose: **exit 1** is drift — the
taxonomy disagrees with the record, and the table needs fixing. **exit
2** is "could not read agntcy/oasf", which is not a finding about the
record at all. A 404 on a class file is absence; a timeout, a 429 or a
5xx is a probe that did not run, and reporting the second as the first
would send somebody to correct a table that was already right.

## What is done, and what is still the keeper's hand

**The JWKS is published.** `https://scvd.store/.well-known/jwks.json`
carries the public half of a Cosign ECDSA P-256 keypair, `kid`
`RLIRwYpmdGr8FvLbCPhS01DHxJK23QMTIXBnPQqU5A4` (its RFC 7638
thumbprint). It is derived from `record-signing-key.pub.pem` in this
folder by `npm run jwks:cut`, never typed, and
`test/directory-jwks.spec.ts` re-derives it and refuses any drift — a
mistyped coordinate would otherwise fail silently, reported by
Directory as "signing key does not match any domain key", which reads
like the wrong key signed rather than like a typo in what we published.

**What Directory actually matches on**, read out of agntcy/dir rather
than its documentation: `server/naming/keys.go` compares raw DER bytes
with `bytes.Equal`, and `IsValidKeyType` accepts `ed25519`,
`ecdsa-p256`, `ecdsa-p384` and `rsa`. `server/naming/types.go` calls
the key id "an optional identifier". So `kty`, `crv`, `x` and `y` are
load-bearing; `kid`, `alg` and `use` are published for readers and are
not consulted for the match. The docs specify the location and the
matching rule but not the field list — the source does.

**This key is not `SIGNING_KEY`.** That seed signs the store's
evidence artifacts and lives in the Worker's secrets. This one
authorises directory metadata, its private half is not in this
repository or the Worker, and the two were deliberately kept apart:
collapsing them would put the whole corpus in the blast radius of a
listing. Revocation is a deploy — drop the key from the PEM, re-cut,
ship, and every signature made under it stops verifying.

**Current-byte signature still owed (reconciled 2026-09-17).** The September
15 local receipt below proves signing and name verification for that historical
CID. The corrected record has different bytes; that receipt does not cover it.
The public JWKS is already served. The private half stays with the keeper.
Shared-node admission, routing publication and independent discovery are separate
unfinished steps; see [the current findings](../../research/distribution-2026-09-17/README.md).

## The release sequence

For the keeper, against a node that is already trusted:

```bash
npm run oasf:taxonomy:check                     # upstream still agrees
npm run oasf:cut && npm test                    # tree agrees with itself

RECORD_CID=$(dirctl push registry/agntcy/record.json --output raw)
dirctl sign "$RECORD_CID" --key "<the record-signing key, not SIGNING_KEY>"
dirctl verify "$RECORD_CID"                     # signature + integrity
dirctl naming verify "$RECORD_CID" --output json  # scvd.store authorises it
dirctl routing publish "$RECORD_CID"            # announce taxonomy + CID
```

Push and sign can be one command; they are separate here so a failure
names itself.

Then check it from the consumer's side, which is the only side that
matters:

```bash
dirctl search --name "scvd.store/*"
dirctl search --domain "finance_and_business/payments"
dirctl search --skill "business_professional/investment_trading/payments_integration"
dirctl search --module "integration/mcp"
dirctl routing search --skill "business_professional/investment_trading/payments_integration"
dirctl search --name "scvd.store/*" --safe        # scanner ran, and said nothing bad
dirctl install scvd.store/agents/general-store --dry-run
```

**Treat the last one as blocking.** A technically valid record that
cannot be installed has given up the one thing this venue offers that
a listing page does not.

Routing announcements carry a TTL and expire, so `dirctl routing
publish "$CURRENT_RECORD_CID"` is a repeating job, not a launch chore —
and it does **not** need a new record. The CID is immutable; re-announce
the same one. Minting a new record version to refresh routing fills the
directory with versions that differ in nothing.

## Version policy

`record.json`'s `version` is `server.json`'s, so it moves with the
other listing manifests rather than becoming a seventh number to
remember. Directory addresses the record by CID regardless; the semver
beside it is for readers. What should *not* happen is a new record on
every deploy: the store's website changes far more often than its
identity, and a directory full of indistinguishable versions is worse
than one entry that is current.

## What has actually been run, and what has not

**2026-09-15, against `dirctl` v1.7.0 and a local daemon:**

    push          ok    baeareibx57ltp5doinx4envdl4rargfarhxrwvrjgussj34movffmp6qb4
    sign          ok    cosign ECDSA P-256, key held by the keeper
    verify        ok    "signature is: trusted", 1 valid signer
    naming verify ok    domain scvd.store, method wellknown,
                        key_id RLIRwYpmdGr8FvLbCPhS01DHxJK23QMTIXBnPQqU5A4,
                        verified_at 2026-09-15T21:03:41Z

That last line is the one worth having. A Directory this store does not
operate fetched `https://scvd.store/.well-known/jwks.json` over the
public internet, compared the published key against the one the record
was signed with, and agreed. The key id it returned is the RFC 7638
thumbprint `npm run jwks:cut` derives from
`record-signing-key.pub.pem`. The record, the published key and the
signing key are one key, checked by something with no reason to
flatter us.

**`naming verify` is a READ, not a check.** `server/controller/naming.go`
looks up a stored row and answers "no verification found" when there
isn't one; the daemon's name-resolution reconciler writes it
asynchronously after signing. The first call after `sign` returns
`verified: false` and means *not yet*, not *no*. Wait and ask again.

**The method is `wellknown`, not `jwks`.** AGNTCY's published example
response shows `"method": "jwks"`; `server/naming/types.go` defines
`MethodWellKnown = "wellknown"`, and the running code agrees with the
source. Second time the docs and the source disagreed on this feature —
the JWK field list was the first. Read the source.

**NOT run: anything on a shared node.** `dirctl push` against
`ads.outshift.io:443` returns `PermissionDenied`: the principal
`oidc:dex:seancrecord` authenticates but is not authorised for
`StoreService/Push`. Note that AGNTCY's own CLI documentation only ever
demonstrates `search` against that host — a read. The maintainer subsequently confirmed the shared testbed is read-only;
publishing requires an independently operated federated node.

So the federated half is untested: whether a record published on one
peer can be found from another by its payment and blockchain taxonomy,
pulled, scanned, and installed. That is the question worth answering
about this venue, and it remains unanswered — which is the standard
this store holds everyone else's doors to, applied to itself.

**What does not depend on that grant.** The record and the JWKS are
served from this origin and are fetchable by anyone, including a
Directory operator who wants to import them. Domain verification is a
property of scvd.store, not of any one Directory instance, so it works
against any node that implements it — including one we run. And the
same taxonomy already reaches readers through the ERC-8004 registration
file, which needs nobody's permission.

## Current distribution constraint — reconciled September 23

The keeper declined recurring/monthly hosting or distribution fees September 18. No federation node has been provisioned. The free Anro external-ingestion request was sent that day but failed final delivery September 21 after connection timeouts; a working alternate contact or ingestion route is needed. The send receipt remains historical: [receipt](../../research/erc8004-followthrough-2026-09-18/anro-contact-receipt.json). The [deployment research](FEDERATION.md) is historical preparation, not an active paid-hosting proposal. Cisco/Anro visibility, current-byte signature and remote scan status remain unverified.

## Federation testbed

AGNTCY runs an open testbed for decentralised discovery, and invites
participants. Participation requires our own federated node, as confirmed September 18.
The peer-to-peer publication and retrieval round-trip remains untested.
