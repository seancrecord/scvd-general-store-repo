import type { Context } from "hono";
import type { CatalogFetcher } from "@/discovery/self-module";
import type { HonoEnv } from "@/types";

/**
 * LOOPBACK, NOT NETWORK — the store reading its own surfaces.
 *
 * The self-passport cites a join over the store's served catalogs,
 * and until 2026-08-26 it fetched them over the PUBLIC INTERNET:
 * six edge round-trips to our own hostname per issue. Two costs,
 * one of them discovered the hard way. In production, latency and
 * subrequests spent re-entering our own front door. In CI, worse
 * than cost: `fetch("https://scvd.store/...")` from inside the test
 * worker reaches the DEPLOYED site, so the join compared production
 * catalogs against the checkout's shelf clusters — and the first PR
 * to add a menu item since the module shipped failed its passport
 * spec against code that was entirely coherent with itself. A gate
 * that compares two different deployments cannot green an honest
 * addition; chicken, meet egg.
 *
 * So the fetcher dispatches through the worker's own handler. Same
 * URL, same routes, same middleware — the surfaces exactly as a
 * stranger receives them — without leaving the process. The dynamic
 * import breaks the module cycle (routes import this, this reaches
 * the app), and the X-House header books the internal knocks as
 * house traffic so six self-reads per passport never read as six
 * visitors on the porch.
 */
export function loopbackCatalogFetcher(c: Context<HonoEnv>): CatalogFetcher {
  const origin = new URL(c.req.url).origin;
  return async (path: string) => {
    const { default: worker } = await import("@/index");
    const response = await worker.fetch!(
      new Request(`${origin}${path}`, {
        headers: { "X-House": "self-passport-loopback" },
      }) as Parameters<NonNullable<typeof worker.fetch>>[0],
      c.env,
      // Hono's ExecutionContext type lags workerd's (tracing/abort);
      // the runtime object is the same one the handler received.
      c.executionCtx as unknown as Parameters<
        NonNullable<typeof worker.fetch>
      >[2],
    );
    if (!(response instanceof Response) || !response.ok) {
      throw new Error(
        `self-catalog ${path} returned ${response instanceof Response ? response.status : "no response"}`,
      );
    }
    return response.text();
  };
}
