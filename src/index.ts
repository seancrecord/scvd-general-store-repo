import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  adminRoutes,
  badgeRoutes,
  bellRoutes,
  buyRoutes,
  catalogRoutes,
  guestbookRoutes,
  llmsRoutes,
  requestRoutes,
  storefrontRoutes,
  verifyRoutes,
} from "@/routes";
import { compileDigest } from "@/services/digest";
import type { Env, HonoEnv } from "@/types";

/**
 * Sean-Claude Van Damme's General Store — the whole shop, one Worker.
 * Routes live in src/routes/, shop data in src/store/, KV logic in
 * src/services/, shared plumbing in src/lib/.
 */
const app = new Hono<HonoEnv>();

app.route("/", storefrontRoutes);
app.route("/", llmsRoutes);
app.route("/", catalogRoutes);
app.route("/", buyRoutes);
app.route("/", guestbookRoutes);
app.route("/", bellRoutes);
app.route("/", requestRoutes);
app.route("/", verifyRoutes);
app.route("/", badgeRoutes);
app.route("/", adminRoutes);

app.notFound((c) =>
  c.json(
    {
      error: "That aisle doesn't exist. The whole store fits on one page:",
      menu_url: `${c.env.STORE_BASE_URL}/menu.json`,
      front_door: `${c.env.STORE_BASE_URL}/llms.txt`,
    },
    404,
  ),
);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    // Deliberate responses (e.g. the Basic Auth challenge) pass through.
    return err.getResponse();
  }
  console.error("Something fell off a shelf:", err);
  return c.json(
    {
      error:
        "Something fell off a shelf back here. Give us a minute and try again — no charge for the noise.",
    },
    500,
  );
});

const worker: ExportedHandler<Env> = {
  fetch: app.fetch,
  // Sundays 7am ET: compile the weekly digest for /admin/digest.
  scheduled: async (_event, env, ctx) => {
    ctx.waitUntil(compileDigest(env));
  },
};

// Cloudflare Workers requires a default export for its fetch/scheduled handlers.
export default worker;
