import { Hono } from "hono";
import {
  operatorStatementHistoryOf,
  readOperatorStatement,
  theNextMonth,
} from "@/services/operator-statement";
import type { HonoEnv } from "@/types";

/**
 * GET /api/operator-statement/{statement_id} — a purchased month on a
 * receiving address, served free forever: every pass signed alone,
 * the summary derived at read with its denominators, the passes we
 * missed counted against us, and the rule-23a pointer to the next
 * month, which is a purchase and never a renewal.
 */
export const operatorStatementRoutes = new Hono<HonoEnv>();

operatorStatementRoutes.get("/api/operator-statement/:statement_id", async (c) => {
  const record = await readOperatorStatement(c.env, c.req.param("statement_id"));
  if (!record) {
    return c.json(
      {
        error:
          "No operator's statement under that id. Ids start with ostmt_ and come from the purchase response; the item is /api/buy/operator_statement — and if you lost the response, POST /api/claims proves the wallet that paid.",
      },
      404,
    );
  }
  const base = c.env.STORE_BASE_URL;
  const history = operatorStatementHistoryOf(record, Date.now());
  const next = theNextMonth(base, record.wallet, record.chain, record.ends_at, history.complete);
  return c.json(
    {
      what_this_is:
        "A month of one receiving address read off the chain by this store, four passes a day, each signed alone over exactly the block range it states. Counts with their denominators; the reader divides. A statement, never a judgment.",
      ...history,
      ...(record.cert_id ? { certificate: `${base}/api/verify/${record.cert_id}` } : {}),
      ...(next ? { the_next_month: next } : {}),
    },
    200,
    { "Cache-Control": "no-store" },
  );
});
