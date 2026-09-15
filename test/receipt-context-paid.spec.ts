import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { installLaborAdmissionHarness, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { items, shelves, call, facilitator, request, object } from "./helpers/buyer-harness";
import { BASE_EVM, TRANSFER_TOPIC } from "@/lib/base-rpc";
installLaborAdmissionHarness();
let defect = "identity";
const hashes = [`0x${"ab".repeat(32)}`, `0x${"cd".repeat(32)}`];
beforeEach(() => { defect = "identity"; facilitator.settleCalls = 0; });
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!init?.body) return inner(input, init);
    const q = JSON.parse(String(init.body));
    const receipt = (hash: string) => ({ transactionHash: defect === "identity" ? `0x${"ef".repeat(32)}` : hash,
      blockNumber: "0x64", status: "0x1", logs: [{ address: BASE_EVM.usdc, topics: [TRANSFER_TOPIC,
        `0x${"0".repeat(24)}${"11".repeat(20)}`, `0x${"0".repeat(24)}${"22".repeat(20)}`], data: `0x${"1".padStart(64, "0")}` }] });
    if (Array.isArray(q)) return Response.json(q.map(entry => ({ jsonrpc: "2.0", id: entry.id,
      ...(defect === "missing-result" ? {} : { result: receipt(entry.params[0]) }) })));
    if (!String(q.method).startsWith("eth_")) return inner(input, init);
    const result = q.method === "eth_chainId" ? (defect === "chain" ? "0x1" : "0x2105") :
      q.method === "eth_blockNumber" ? (defect === "head" ? "0x1" : "0x90") : receipt(q.params[0]);
    return Response.json({ jsonrpc: "2.0", id: q.id, result });
  });
});
for (const id of ["settlement_attestation", "attestation_bundle", "settlement_reconciliation"]) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  for (const failure of ["identity", "chain", "head", ...(id === "attestation_bundle" ? ["missing-result"] : [])]) {
    it(`${id} ${door}: ${failure} is refused before settlement`, async () => {
      defect = failure;
      const item = items.find(item => item.id === id)!;
      const args = id === "attestation_bundle" ? { tx_hashes: hashes.join(",") } : { tx_hash: hashes[0] };
      const offer = (await call(item, "mcp", args, shelves(item)[0])).offers[0]!;
      const payment = await signLabor(offer);
      const response = await sendLabor(id, door, args, payment);
      expect(response.refused).toBe(true);
      expect(transfers).toBe(0);
      expect(facilitator.settleCalls).toBe(0);
      expect(response.body).toMatchObject({ code: "receipt_evidence_unavailable", charged: false,
        settlement_attempted: false, retry_safe: true, retry_with_same_payment: true, temporary: null, verify_url: null });
      defect = "";
      const recovered = await sendLabor(id, door, args, payment);
      expect(recovered.refused).toBe(false);
      expect(transfers).toBe(1);
      expect(facilitator.settleCalls).toBe(1);
      const observations = id === "attestation_bundle" ? recovered.body.attestations as Record<string, unknown>[] : [object(recovered.body[id === "settlement_reconciliation" ? "reconciliation" : "attestation"])];
      expect(observations.map(observation => observation.tx_hash)).toEqual(id === "attestation_bundle" ? hashes : hashes.slice(0, 1));
      expect(object(await (await request(String(recovered.body.verify_url))).json()).valid).toBe(true);
    });
  }
}
