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
