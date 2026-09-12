# Exact log additions — audit 22

No BUY identifier added and no previous finding closed. Four enhancements (E22-01–04) and roadmap row B22 are new. Existing content is preserved.

## research/BUYER_AUDIT_LOG.md

```markdown
## Deployment-boundary audit — September 11–12, 2026 (#22)

**No new BUY defect observed in the exercised control.** Eighteen live half-cent Base purchases through HTTP and MCP delivered their original, correctly bound signed goods for 0.09 USDC during a controlled deployment. Execution-version logs show an old-version paid request overlapping the deployment and new-version requests afterward. Both retained old quotes bought successfully on the new store version; both pre-deployment certificates verified afterward. The isolated two-runtime human-order control retained the entire queued-order response and verified its certificate with two simulated debits.

**Scope remains partial:** identical deployed module bytes and runtime/bindings; one client location; Base only; the doors Worker did not change; real human labor and changed-code/schema compatibility were not exercised. This run does not close earlier defects. Evidence and the authorization-window close are scored in [the full report](deployment-boundary-2026-09-11/REPORT.md) and [repeatable benchmark](BUYER_DEPLOYMENT_BOUNDARY.md).

Enhancements: **E22-01**, carry the benchmark across an actual approved functional/schema release; **E22-02**, independently roll the doors/store pair with old catalog and input contracts outstanding; **E22-03**, add attributed multi-region and additional-rail coverage under explicit spending caps; **E22-04**, carry an existing consented live human commission through release, completion and polling. Build follow-through is filed as **B22** in ROADMAP.md.
```

## ROADMAP.md

```markdown
| B22 | **Deployment-boundary benchmark — unchanged-code control complete September 12; changed-release coverage remains.** 18 live HTTP/MCP Base purchases delivered for 0.09 USDC across an attributed store-version rollout; retained quotes and old certificates survived. Isolated human-order restart passed. | A buyer object must survive the next answering Worker revision. | Preserve the scored evidence and negative detector controls in `research/BUYER_DEPLOYMENT_BOUNDARY.md`. Next actual approved functional/schema release: retained quotes, original certificates and existing orders; independently roll store/doors; add multi-region and other-rail denominators. Real human-order completion remains separate from the passing simulated queued-order control. E22-01–04; no new BUY defect from this bounded control. |
```

[Focused diff](log-additions.diff)
