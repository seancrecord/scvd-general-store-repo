import { expect, it } from "vitest";
import { SOLANA_CHAIN } from "@/lib/solana-rpc";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor } from "./helpers/labor-admission";
import { items, shelves, call, object, request, SOL } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
for (const [network, chain] of [["base", "eip155:8453"], ["polygon", "eip155:137"], ["solana", SOLANA_CHAIN]]) {
  for (const door of ["http", "mcp", "mcp-standard"] as const) {
    it(`${door}: ${network} statement tells its recipient which chain to verify`, async () => {
      const item = items.find(item => item.id === "the_statement")!;
      const args = { network: network!, wallet: network === "solana" ? SOL : `0x${"11".repeat(20)}`, hours: "3" };
      const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(offer => offer.network === laborNetworks()[0])!;
      const paid = await sendLabor(item.id, door, args, await signLabor(offer));
      expect(paid.refused).toBe(false);
      expect(object(paid.body.statement).chain).toBe(chain);
      expect(paid.body.verify_note).toContain(chain);
      const response = await request(String(paid.body.statement_url));
      expect(response.status).toBe(200);
      const retrieved = object(await response.json());
      expect(object(retrieved.statement).chain).toBe(chain);
      expect(retrieved.what_this_is).toContain(chain);
      expect((retrieved.how_to_verify as string[])[2]).toContain(chain);
      expect((retrieved.how_to_verify as string[])[2]).toContain("statement.scope");
      if (network !== "base") {
        expect(retrieved.what_this_is).not.toContain("Base");
        expect(paid.body.verify_note).not.toContain("Base");
      }
    });
  }
}
