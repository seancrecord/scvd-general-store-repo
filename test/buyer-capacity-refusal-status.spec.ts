import { afterEach, expect, it, vi } from "vitest";
import { OPEN_LABOR_CAP } from "@/services/queue-capacity";
import { LaborCapacityStore } from "@/services/labor-reservations";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { items, baseline, call, shelves, object, request } from "./helpers/buyer-harness";
installLaborAdmissionHarness();
afterEach(() => vi.restoreAllMocks());
for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks()) for (const failure of ["full", "lost_ack"] as const) {
  it(`${door} ${network} ${failure}: refusal exposes non-payment status before a new purchase`, async () => {
    const item = items.find(item => item.id === "the_collab")!, args = { ...baseline(item), detail: `SCVD-E2E refusal status ${crypto.randomUUID()}` };
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(offer => offer.network === network)!;
    const payment = await signLabor(offer), key = crypto.randomUUID();
    const reserve = LaborCapacityStore.prototype.reserve;
    const fault = vi.spyOn(LaborCapacityStore.prototype, "reserve");
    if (failure === "full") fault.mockResolvedValueOnce({ ok: false, open: OPEN_LABOR_CAP, cap: OPEN_LABOR_CAP, scope: "house" });
    else fault.mockImplementationOnce(async function (this: LaborCapacityStore, ...args) {
      await reserve.apply(this, args);
      throw new Error("fixture loses reservation acknowledgement");
    });
    const refused = await sendLabor(item.id, door, args, payment, key);
    expect(refused.body).toMatchObject({ code: "capacity_unavailable", charged: false, settlement_attempted: false });
    const recovery = object(refused.body.recovery);
    expect(recovery).toMatchObject({ purchase_recorded: true, status_tool: "check_purchase" });
    expect(String(refused.body.error)).toContain("status");
    const status = await request(String(recovery.status_url), { headers: { Authorization: `Bearer ${String(recovery.status_token)}` } });
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ payment_state: "not_settled", charged: false });
    const retry = await sendLabor(item.id, door, args, payment, key);
    expect(retry.body).toMatchObject({ code: "purchase_not_settled", payment_state: "not_settled", charged: false });
    expect(transfers).toBe(0);
    fault.mockRestore();
    const fresh = await signLabor(offer);
    const bought = await sendLabor(item.id, door, args, fresh, crypto.randomUUID());
    expect(bought.refused, JSON.stringify(bought.body)).toBe(false);
    expect(transfers).toBe(1);
  });
}
