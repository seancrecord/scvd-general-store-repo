# Public discovery records — October 7, 2026

The keeper supplied these six destinations and asked that they be added to the
store's discovery documentation. All six public pages were opened and read.
Five new records go into `EXTERNAL_RECORDS`; the existing ChatGPT entry is
refreshed once. These are observations of public pages, not submissions,
endorsements, client qualifications or proof of sales.

| Surface | Observed listing | What the page establishes | Limits and discrepancies |
| --- | --- | --- | --- |
| ChatGPT | [SCVD x402 Verifier](https://chatgpt.com/plugins/plugin_asdk_app_6aaa9b3afcc081918be808a0d8cfd212) | Public plugin page shows SCVD x402 Verifier, developer scvd.store, version 2.0.0, App and Skill sections, installation entry point, and links to the store/privacy/rights pages. | Confirms public presence of the updated listing and its skill section. The installed skill's bytes and actual ChatGPT execution were not inspected. September 17 admission history is retained. |
| Deside | [scvd.store host](https://deside.io/x402/h/scvd.store) · [Opening Day item](https://deside.io/x402/t/scvd-buy-opening-day) | Host page displays 49 x402 tools. Opening Day has an individual page showing 9 USDC and several chain entries, attributed to Coinbase CDP. | The user's link text named the item while its target was the host. Both were checked; the host is the canonical discovery row, with the item retained here. These are dated directory displays, not a verified current menu or purchase result. |
| MCP Harbor | [store.scvd/general-store](https://ai.mcpharbor.dev/servers/store.scvd/general-store) | Names SCVD General Store MCP, version 0.2.4, streamable HTTP at `https://scvd.store/mcp`, the source repository and 21 tools. Identifies itself as an official-registry mirror. | Its official label is provenance, not certification. Tool annotations are inferred from names according to the page; client setup instructions were not executed. |
| Electra Index | [SCVD General Store](https://electraindex.com/mcp/scvd-general-store) | Names the server and links the correct site and repository. Shows a change history and identifies its registry source. | Displays version 0.11.2, local install yes and remote access no. The official registry read the same day instead returns version 0.2.4, a streamable-HTTP remote and no packages. Cause unestablished; preserve the discrepancy rather than copying it into our metadata. Capability matching is labeled automatic and low confidence. |
| makememoneynomistakes.ai | [Base agent 86957](https://makememoneynomistakes.ai/agent/base:86957) | Names SCVD General Store under the exact Base identity, links a September 28 feedback transaction, and associates x402 resources with the agent. | The displayed verdict was LEGIT, with rookie/reviews-only status, score null, rank null, zero clean jobs and zero clients. It listed 32 paid resources. Those are its method's dated outputs, not a store-wide sales census, an audit or a verdict SCVD adopts. Its downloadable checker was not run. |
| Agora by openforallofus | [store.scvd/general-store](https://openforallofus.com/tools/store.scvd/general-store) | Publishes a handshake and tools/list observation dated October 5, with the correct endpoint, 21 tools and registry version 0.2.4. | The page says there are no signed reports yet. Classify as an instrument observation, not peer verification or successful use of the tools. |

## Source reads

The web reader could read ChatGPT but could not access the other five sites.
The desktop browser subsequently read all six listings and the Deside item page;
the web-reader failures are transport limitations, not evidence of absence.

The [official MCP registry response](https://registry.modelcontextprotocol.io/v0.1/servers/store.scvd%2Fgeneral-store/versions/latest)
was also read directly on October 7. Relevant fields:

```json
{
  "name": "store.scvd/general-store",
  "version": "0.2.4",
  "remotes": [{ "type": "streamable-http", "url": "https://scvd.store/mcp" }],
  "packages": null
}
```

`packages: null` above records the absent field in the selected-field reading.
It is not an assertion that every historic version lacks a package. Electra's
history alternates between local/package and hosted versions; the cause was
not diagnosed and no correction request was sent.

## Placement

- `src/store/trust-signals.ts`: five new dated records and one refreshed ChatGPT
  row. Existing trust/discovery views consume that source; no duplicate registry
  list or new public page is introduced.
- `DISTRIBUTION.md` and `registry/README.md`: pointers to this dated pass and
  correction of the stale ChatGPT update-publication uncertainty.
- `registry/openai-plugin-verifier-submission.md` and the existing keeper row:
  version 2.0.0 and public skill presence observed; installed-content and runtime
  qualification remain separate.
- `docs/ERC8004_AGENT_86957.md`: points to the new agent-specific index. This
  service indexes a named agent and associated resources, so it belongs in
  external records; the existing rule keeping plain block explorers separate
  still applies.
- `docs/THE_MAP_2026-09.md`: dated superseding note for the historical ChatGPT
  submission row; September's snapshot remains intact.

The keeper authorized release of this task’s writing and discovery changes via
[PR #993](https://github.com/seancrecord/scvd-general-store-repo/pull/993).
Its required CI checks gate the merge.
No external listing was edited, submitted, installed or contacted in this pass.

## Validation

The existing trust-signal suite passed all 13 tests, including dates, scope
limits and discovery through the homepage metadata. Typecheck passed. A
duplicate check confirmed each supplied listing URL occurs exactly once in the
canonical records. No new runtime behavior or test fixtures were introduced.
