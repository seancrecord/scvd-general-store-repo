import { Hono } from "hono";
import { getWalletStatement } from "@/services/wallet-statement";
import type { HonoEnv } from "@/types";

/**
 * GET /api/statement/{statement_id} — a purchased wallet statement,
 * served free forever: the signed transfer record, the certificate
 * that bound it, and how to verify both.
 */
export const statementRoutes = new Hono<HonoEnv>();

statementRoutes.get("/api/statement/:statement_id", async (c) => {
  const record = await getWalletStatement(c.env, c.req.param("statement_id"));
  if (!record) {
    return c.json(
      {
        error:
          "No statement under that id. The id is on the purchase response and the certificate; the item is /api/buy/the_statement.",
      },
      404,
    );
  }
  const base = c.env.STORE_BASE_URL;
  return c.json(
    {
      what_this_is:
        "A signed record of every USDC transfer in and out of the wallet named inside, over exactly the block window stated, read off Base by this store at the moment stated. A statement, never a judgment: no comparison to anyone's ledger was made — the holder does the comparing, and the difference is the finding.",
      statement: record.statement,
      certificate: `${base}/api/verify/${record.cert_id}`,
      how_to_verify: [
        "1. The record is signed on its own: re-serialize every field above `signature` (same order) and check the ed25519 signature against the key at /.well-known/scvd-signing-key.",
        "2. The record's evidence_hash is bound into the purchase certificate's attests field — the certificate URL above answers for it.",
        "3. Every row is a Base transaction hash: paste any of them into an explorer and the chain answers without asking us. Re-run the same indexed eth_getLogs over the stated block window and the whole list reproduces.",
      ],
      created_at: record.created_at,
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
});
