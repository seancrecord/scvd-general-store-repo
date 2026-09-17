## Bug Description and reproduction

SCVD General Store's Base identity 86957 is listed at
https://8004scan.io/agents/base/86957. On September 17 its Services panel showed
MCP unhealthy with an HTTP 405 check labelled two hours old. The endpoint is
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


Rechecked September 17, 2026 around 18:35 UTC. Submitted on behalf of SCVD’s maintainer. No wallet connected and no payment attempted.
