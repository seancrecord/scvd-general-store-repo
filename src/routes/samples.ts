import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { priceLine } from "@/services/menu-markdown";
import { sampleOnceOver } from "@/services/sample-artifacts";
import { getMenuItem } from "@/store/menu";
import type { HonoEnv } from "@/types";

/**
 * GET /samples — what a purchase actually hands back (#31).
 *
 * THE TOP-OF-FUNNEL GAP THIS CLOSES. The shelf describes every paid
 * artifact in prose and shows nobody one. A buyer weighing $5 can
 * read what the Once-Over claims to be and cannot read one, which
 * asks them to buy a document sight unseen from a store whose entire
 * pitch is that you should not have to take anybody's word.
 *
 * ONE SAMPLE TODAY, NOT A GALLERY. The Once-Over is the flagship and
 * the one a stranger evaluates first. Building five samples of five
 * artifacts before knowing whether anyone reads one would be the same
 * mistake the roadmap keeps catching: shipping the general case for a
 * demand nobody has demonstrated. The mechanism generalises when a
 * second artifact earns one.
 *
 * WHY THE SPECIMEN CANNOT BE SIGNED is in services/sample-artifacts.ts
 * and is the most important thing about this room.
 */
export const samplesRoutes = new Hono<HonoEnv>();

const PRICE_FALLBACK = 5;

function onceOverPrice(): number {
  return getMenuItem("service_audit")?.price_usdc ?? PRICE_FALLBACK;
}

function pageHtml(base: string, artifact: Awaited<ReturnType<typeof sampleOnceOver>>): string {
  const item = getMenuItem("service_audit");
  const failed = artifact.sample.checks.filter((check) => !check.ok);
  const rows = artifact.sample.checks
    .map(
      (check) =>
        `<tr><td><code>${escapeHtml(check.name)}</code></td><td>${check.ok ? "passed" : "<strong>failed</strong>"}</td><td>${escapeHtml(check.detail ?? "")}</td></tr>`,
    )
    .join("");
  return `<section>
      <p class="menu-desc"><strong>${escapeHtml(artifact.what_this_is)}</strong></p>
      <p class="menu-desc">${escapeHtml(artifact.not_signed)}</p>
    </section>
    <section>
      <h2>The sample, in full</h2>
      <p class="menu-desc">Verdict on the constructed door: <code>${escapeHtml(artifact.sample.verdict)}</code> &mdash; ${failed.length} of ${artifact.sample.checks.length} checks failed. Machine copy: <a href="/samples/once-over.json"><code>/samples/once-over.json</code></a>.</p>
      <table>
        <thead><tr><th>Check</th><th>Result</th><th>What it means</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="menu-desc">Scope, printed on the real artifact exactly as it is printed here: ${escapeHtml(artifact.sample.scope)}</p>
      <p class="menu-desc">Criteria: ${escapeHtml(artifact.sample.criteria)}</p>
    </section>
    <section>
      <h2>What this sample is not</h2>
      <p class="menu-desc">${escapeHtml(artifact.not_about_anyone)}</p>
    </section>
    <section>
      <h2>Buying the real one</h2>
      <p class="menu-desc"><strong>${escapeHtml(item?.name ?? "The Once-Over")}</strong> &mdash; ${escapeHtml(item ? priceLine(item) : "$5 fixed")}. Same battery, your endpoint, signed and dated, verifiable offline forever at <code>/api/verify/{id}</code>: <a href="/menu/service_audit">what it is</a>, or <code>GET ${base}/api/buy/service_audit?url=&hellip;</code> over x402.</p>
      <p class="menu-desc"><strong>Or check your own door for nothing first.</strong> The same battery runs free at <a href="/conformance">/conformance</a> and at <a href="/api/preflight/v1"><code>/api/preflight/v1</code></a>. What the $5 adds is the signature, the date and the artifact &mdash; not the checking. If the free run tells you what you needed, that is the honest outcome and you owe us nothing.</p>
      <p class="menu-desc"><strong>Or hand it to your agent:</strong> <em>&ldquo;Read ${base}/samples/once-over.json to see the shape, run ${base}/api/preflight/v1 against my endpoint free, and if I need a signed dated copy buy ${base}/api/buy/service_audit?url=&hellip; over x402.&rdquo;</em></p>
    </section>`;
}

samplesRoutes.get("/samples/once-over.json", async (c) => {
  return c.json(await sampleOnceOver(c.env, onceOverPrice()));
});

samplesRoutes.get("/samples", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const artifact = await sampleOnceOver(c.env, onceOverPrice());
  if (wantsHtml(c.req.header("Accept"))) {
    return c.html(
      renderSimplePage({
        title: "What a purchase hands back",
        description:
          "A free, unsigned sample of the Once-Over — the $5 signed audit of one x402 endpoint. Every field a buyer gets, run against a door that fails on purpose so the sample shows the instrument working.",
        path: "/samples",
        bodyHtml: pageHtml(base, artifact),
      }),
    );
  }
  return c.json({
    what_this_is: artifact.what_this_is,
    samples: [`${base}/samples/once-over.json`],
    free: "Yes. Nothing on this surface is charged for, now or later.",
    the_real_thing: `${base}/api/buy/service_audit`,
    check_your_own_door_free: `${base}/api/preflight/v1`,
  });
});
