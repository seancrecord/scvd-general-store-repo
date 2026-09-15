const PRIOR = "Uncertain payment: keep the original payment/key. Use recovery.purchase_id\nand private recovery.status_token with MCP check_purchase, or GET\n`https://scvd.store/api/purchase-status/{purchase_id}` with Authorization: Bearer\n<status_token>. Free after authorization expiry; payment status alone\nis not proof of delivery. Avoid a second authorization while unresolved.\n\n";
import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { PURCHASE_RECOVERY_GUIDANCE } from "@/lib/purchase-status-contract";
import { mcpToolCatalog } from "@/lib/mcp-tools";
const normalize = (text: string) => text.replace(/Served: \d{4}-\d{2}-\d{2}/g, "Served: <DATE>").replace(/Last checked by hand: \d{4}-\d{2}-\d{2}/g, "Last checked: <DATE>");
async function digest(text: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2,"0")).join(""); }
it("reversing only the recovery paragraph reproduces the prior guide exactly", async () => {
  const full = await (await SELF.fetch("https://scvd.store/llms-full.txt")).text();
  expect(full.split(PURCHASE_RECOVERY_GUIDANCE)).toHaveLength(2);
  const reversed = full.replace(PURCHASE_RECOVERY_GUIDANCE + "\n\n", PRIOR);
  expect(await digest(normalize(reversed))).toBe("d1b4386be296e68479f7500b67bc999d4f951f06c1215bab1476c1e767dcc92f");
  const developers = await (await SELF.fetch("https://scvd.store/developers/llms.txt")).text();
  expect(developers.length).toBe(29952);
  expect(mcpToolCatalog("https://scvd.store").reduce((sum,tool) => sum + tool.description.length,0)).toBe(33990);
  console.log(JSON.stringify({guide_sha256: await digest(normalize(full)), prior_sha256: await digest(normalize(reversed)), developer_characters: developers.length, mcp_description_characters: mcpToolCatalog("https://scvd.store").reduce((sum,tool) => sum + tool.description.length,0)}));
});
