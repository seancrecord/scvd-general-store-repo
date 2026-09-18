# 8004scan bug report — submitted

Submitted as [#51](https://github.com/alt-research/8004scan-issue-tracker/issues/51) after fresh reproduction. Exact posted body: [8004SCAN_ISSUE_BODY.md](8004SCAN_ISSUE_BODY.md). Original preparation follows.

Use the [official bug form](https://github.com/alt-research/8004scan-issue-tracker/issues/new?template=bug_report.yml).

- **Title:** [Bug]: Base 86957 cached MCP health reports 405 despite successful protocol initialization
- **Affected Component:** Validation System
- **Severity:** Medium - Feature is impaired but workaround exists
- **Browser:** Other — Codex in-app browser
- **Operating System:** macOS
- **Wallet:** Not applicable
- **Blockchain Network:** Base (identity lookup; no wallet connected)
- **Page URL:** https://8004scan.io/agents/base/86957?tab=services
- **Screenshots / console:** Not captured; public response evidence retained in this research directory.

## Bug Description and reproduction

Destination: [official issue tracker](https://github.com/alt-research/8004scan-issue-tracker).
Title: Base 86957: cached MCP HTTP 405 versus working Streamable HTTP initialization

SCVD General Store's Base identity 86957 is listed at
https://8004scan.io/agents/base/86957. On September 17 its Services panel showed
MCP unhealthy with an HTTP 405 check from two days earlier. The endpoint is
https://scvd.store/mcp. A bare GET currently returns 405, while these protocol
requests succeed:

```sh
curl -i https://scvd.store/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"directory-repro","version":"1.0.0"}}}'
curl -i --max-time 4 https://scvd.store/mcp \
  -H 'Accept: text/event-stream'
```

Initialization returned HTTP 200. The second request returned HTTP 200 and an
initial SSE comment; its timeout is intentional. Could you refresh this check
and confirm its request method/Accept negotiation? We cannot infer from the
cached result which request the checker sent or whether the endpoint behaved
differently at that earlier time. An initialize-based check would distinguish
a transport failure from a bare-GET refusal. No payment or authentication is
needed for initialization.

## Expected Behavior

Use transport-aware checks, retain their request method and observation time,
and distinguish a cached failure from the current protocol response. Please
refresh the metadata and health check and identify whether the prior result
was caused by different server behavior, request negotiation or stale data.

## Checklist before posting

Repeat the duplicate search and live reproduction. Confirm the findings still
hold, attach only public evidence, and complete the form's required checklist.
No wallet details, credentials or private keys are needed.
