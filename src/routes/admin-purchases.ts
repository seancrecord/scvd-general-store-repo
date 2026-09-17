import { Hono } from "hono";
import type { Context } from "hono";
import type { HonoEnv } from "@/types";
import { inspectPurchase } from "@/services/purchase-inspection";
import { renderPurchasePage } from "@/pages/admin/purchase-page";
import { wantsHtml } from "@/pages/simple-page";

/** Mounted only behind the existing keeper authentication. */
export const adminPurchaseRoutes = new Hono<HonoEnv>({ strict: false });
async function inspect(c: Context<HonoEnv>) {
  const id = c.req.param("id") ?? c.req.query("purchase_id");
  const html = wantsHtml(c.req.header("Accept"));
  if (!id && html) return c.html(renderPurchasePage());
  const result = await inspectPurchase(c.env, id ?? "");
  return html ? c.html(renderPurchasePage(result), result.status) : c.json(result.body, result.status);
}
adminPurchaseRoutes.get("/", inspect);
adminPurchaseRoutes.get("/:id", inspect);

/** A keeper decision against matched immutable evidence, never a repair on GET. */
adminPurchaseRoutes.post("/:id/house-correction", async c => {
  const origin = c.req.header("Origin");
  const site = c.req.header("Sec-Fetch-Site");
  if ((origin !== undefined && origin !== new URL(c.env.STORE_BASE_URL).origin) ||
    (site !== undefined && site !== "same-origin" && site !== "none")) {
    return c.json({ code: "cross_site_refused" }, 403);
  }
  const id = c.req.param("id");
  const inspection = await inspectPurchase(c.env, id);
  const purchase = inspection.body.purchase;
  if (inspection.status !== 200 || !purchase || purchase.protocol !== "mpp" || purchase.house !== false ||
    purchase.accounting_check !== "confirmed" || !purchase.ledger.sale) return c.json({ code: "house_correction_not_available" }, 409);
  const body = await c.req.parseBody();
  if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 500) return c.json({ code: "reason_required" }, 400);
  const { isHouseWallet } = await import("@/lib/channel");
  if (!isHouseWallet(c.env, purchase.payer)) return c.json({ code: "register_house_wallet_first" }, 409);
  const sale = purchase.ledger.sale;
  try {
    await c.env.COUNTER_LEDGER!.get(c.env.COUNTER_LEDGER!.idFromName(`${sale.month}/mpp-sales`)).correctMppHouseSale({
      id, month: sale.month, payer: sale.payer, transaction: sale.transaction, amount: sale.amount_atomic, house: sale.house,
    }, body.reason);
  } catch {
    return c.json({ code: "house_correction_unavailable", note: "Read this purchase again before retrying. A committed correction is applied at most once." }, 503);
  }
  return c.redirect(`/admin/purchases/${id}`, 303);
});
