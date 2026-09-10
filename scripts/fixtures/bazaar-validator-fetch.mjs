// Every request is intercepted; this fixture cannot make a payment or call a live service.
globalThis.fetch = async (url, init) => {
  if (String(url) === "https://scvd.store/menu.json") return Response.json({ items: [{ id: "hello" }] });
  if (String(url) !== "https://api.cdp.coinbase.com/platform/v2/x402/validate") throw new Error("Unexpected URL");
  const body = JSON.parse(init.body);
  if (init.method !== "POST" || body.resource !== "https://scvd.store/api/buy/hello" || body.method !== "GET" || Object.keys(body).length !== 2 || init.headers.Authorization) {
    return Response.json({ errorMessage: "Expected public validation request: resource and method" }, { status: 400 });
  }
  switch (process.env.SCVD_BAZAAR_TEST_MODE) {
    case "rejected": return Response.json({ valid: false, simulation: { outcome: "rejected", rejectionReason: "invalid discovery configuration" }, preflight: [{ check: "parse", passed: false, severity: "required", detail: "pattern must be a valid regex" }], index: null });
    case "unknown": return Response.json({ simulation: { outcome: "accepted" } });
    case "contradictory": return Response.json({ valid: true, simulation: { outcome: "rejected" } });
    case "failure": return Response.json({ errorMessage: "temporarily unavailable" }, { status: 503 });
    default: return Response.json({ valid: true, simulation: { outcome: "accepted" }, preflight: [], index: null });
  }
};
