import { Hono } from "hono";
import {
  getPass,
  passIsCurrent,
  signedMonthlyNote,
} from "@/services/patronage";
import type { HonoEnv } from "@/types";

/**
 * GET /api/patronage/:pass_id — a standing patronage pass: its dates,
 * whether it's current, and (while current) the keeper's signed monthly
 * note. Renewal happens by buying recurring_patronage again with
 * pass_id as a query parameter.
 */
export const patronageRoutes = new Hono<HonoEnv>();

patronageRoutes.get("/api/patronage/:pass_id", async (c) => {
  const pass = await getPass(c.env, c.req.param("pass_id"));
  if (!pass) {
    return c.json(
      { error: "No pass by that id on the wall. Passes start at the register." },
      404,
    );
  }
  const current = passIsCurrent(pass);
  const base: Record<string, unknown> = {
    pass,
    current,
    badge_url: `${c.env.STORE_BASE_URL}/badges/${pass.patron_number}.svg`,
    renew_url: `${c.env.STORE_BASE_URL}/api/buy/recurring_patronage?pass_id=${pass.pass_id}`,
  };
  if (!current) {
    return c.json({
      ...base,
      note: "This pass has lapsed. The badge is forever; the monthly note waits on a renewal.",
    });
  }
  const monthly = await signedMonthlyNote(c.env);
  return c.json({
    ...base,
    monthly_note: monthly,
    note: "Pass is current. The monthly note above is signed — verify it against the key at /.well-known/scvd-signing-key.",
  });
});
