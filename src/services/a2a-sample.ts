import { authorize, readCard, runRuntime, A2A_AUTH_PATH, record } from "@/lib/a2a-instrument";
import { repairRows } from "@/store/a2a-repair";
import type { Env } from "@/types";
const ORIGIN = "https://a2a-fixture.example";
const CARD = ORIGIN + "/.well-known/agent-card.json";
const NOW = Date.parse("2026-09-07T00:00:00Z");
/** Constructed bytes enter the real instrument below the signing boundary. No host is contacted. */
export async function sampleA2AKit(env: Env, price: number) {
  const fetchFixture: typeof fetch = async (input, init) => {
    if (String(input) === CARD) return Response.json({ protocolVersion: "0.3.0", name: "Specimen", description: "A constructed test agent", version: "1", url: ORIGIN + "/a2a", capabilities: {}, defaultInputModes: ["text/plain"], defaultOutputModes: ["text/plain"], skills: [] });
    if (String(input) === ORIGIN + A2A_AUTH_PATH) return Response.json({ allow_scvd_audit: true, allow_negative_tests: true, safe_to_repeat: true, card_url: CARD, endpoint: ORIGIN + "/a2a", expires_at: "2026-09-08T00:00:00Z", message: { kind: "message", role: "user", messageId: "specimen", parts: [{ kind: "text", text: "safe test" }] } });
    let body: unknown;
    try { body = JSON.parse(String(init?.body)); } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
    const id = record(body) ? body.id : null;
    if (id === "send" || id === "get") return Response.json({ jsonrpc: "2.0", id, result: { kind: "task", id: "specimen-task", status: { state: "completed" } } });
    if (id === "null-part" || id === "trailing-part") return new Response("Constructed server error", { status: 500 });
    return Response.json({ jsonrpc: "2.0", id, error: { code: id === "cancel" ? -32002 : -32001, message: "Constructed protocol error" } });
  };
  const reading = await readCard(CARD, fetchFixture, NOW);
  const permission = await authorize(reading, fetchFixture, NOW);
  const report = await runRuntime(reading, permission, fetchFixture, () => NOW);
  const sample = JSON.parse(JSON.stringify({ observation: report, repairs: repairRows(report), runner_url: "/api/a2a/runner.mjs" }).replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/g, "specimen-generated-id")) as unknown;
  return { specimen: true as const, mark: "SPECIMEN", what_this_is: "The A2A instrument finding missing task context and malformed-input crashes in constructed responses.", not_signed: "This specimen is unsigned and cannot verify. It contains no evidence hash, issuer key or signature.", not_about_anyone: "No host was contacted. The .example target and responses are constructed; this is not an observation about an operator.", of_item: "a2a_repair_kit", price_of_the_real_thing: `$${price}`, buy_url: `${env.STORE_BASE_URL}/api/buy/a2a_repair_kit`, sample };
}
