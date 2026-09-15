# AGNTCY Directory (`agntcy/`)

House rule 30 applies here as everywhere in this drawer: **publishing
is a queue — the keeper reviews, the keeper submits.** Nothing below
runs on its own, and nothing below signs anything.

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

## What is NOT done, and needs the keeper's hand

**The record is not signed, and scvd.store publishes no JWKS.**

Directory separates two things this store already knows are different:
*provenance* (who asserted this) and *observation* (what was actually
seen). Signing a pushed record establishes the first. Name verification
goes further — a record named `https://scvd.store/agents/general-store`
is bound to that domain only when it is signed by a key published at
`https://scvd.store/.well-known/jwks.json`, after which it resolves as
`scvd.store/agents/general-store` instead of a raw CID.

That key does not exist, and this change deliberately does not invent
one:

- It must **not** be `SIGNING_KEY`. That seed signs the store's
  evidence artifacts. Reusing it to authorise directory metadata
  collapses two trust domains into one, and the blast radius of the
  evidence key is the whole corpus.
- Which key authorises directory records — a new ed25519 seed, a KMS
  key, a Sigstore identity — is a keeper decision with a key-registry
  entry behind it (`src/store/key-registry.ts`), not something a
  publishing script should pick.

Publishing a `jwks.json` before that decision would be a published
protocol with no mechanism under it, which is the defect class this
store keeps finding in itself. So the gap is named here instead.

`scvd.erc8004.identity` **is** carried, composed from
`src/store/agent-identity.ts` rather than typed here:
`eip155:8453:0x8004…a432/86957`, the ERC's own
`{namespace}:{chainId}:{identityRegistry}` string with the token id
after it. It says this record and agent 86957 are the same party,
which `ownerOf(86957)` settles against Base without asking us. It does
not say the registration is finished — the on-chain `tokenURI` still
points at the bare origin, so explorers reading the agent as
"Unconfigured" are right to (`docs/ERC8004_AGENT_86957.md`). A
cross-link is not a status claim.

## The release sequence, when there is a key

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

## Federation testbed

AGNTCY runs an open testbed for decentralised discovery. The question
worth answering there is not "does push work" but: can a record
published on one peer be found from another by its payment and
blockchain taxonomy, pulled, verified by its domain name, scanned, and
installed? Until that round-trip has actually been run, the value of
this listing is unproven — which is the same standard this store holds
everyone else's doors to.
