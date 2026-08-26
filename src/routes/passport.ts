import { Hono } from "hono";
import { loopbackCatalogFetcher } from "@/lib/self-fetch";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  AGING_DAYS,
  FRESH_DAYS,
  issuePassport,
  issueSelfPassport,
  type EndpointPassport,
} from "@/services/passport";
import type { HonoEnv } from "@/types";

/**
 * /passport — the Endpoint Passport's two doors: the landing that
 * explains the artifact (and serves OUR OWN passport as the public
 * example every outside read asked for), and /passport/{host} for
 * any host the census has observed on the ready side.
 *
 * Free, like the fresh set: the passport is the evidence layer's
 * front door, and the paid tier (refresh-on-demand, the watch
 * bundle) arrives with the P-later builds once the keeper prices it.
 */
export const passportRoutes = new Hono<HonoEnv>();

function passportHtml(passport: EndpointPassport): string {
  const p = passport.payload;
  return `<section>
    <h2>${escapeHtml(p.host)} — <em>${escapeHtml(p.freshness)}</em></h2>
    <p class="menu-meta">issued ${escapeHtml(p.issued_at.slice(0, 16))}Z ·
    expires ${escapeHtml(p.expires.slice(0, 10))} ·
    latest verdict: <strong>${escapeHtml(p.latest?.verdict ?? "none")}</strong>
    ${p.latest?.observed_at ? `observed ${escapeHtml(p.latest.observed_at.slice(0, 10))}` : ""}</p>
    <p class="menu-meta">history: first observed ${escapeHtml(p.history.first_observed ?? "—")},
    ${p.history.rounds_probed} rounds probed, ${p.history.rounds_gapped} gapped,
    ${p.history.verdict_changes} verdict changes ·
    <a href="${escapeHtml(p.history.full_history_url)}">full signed history</a></p>
    <p class="menu-meta">observer: ${escapeHtml(p.observer)}</p>
    ${p.modules
      .map(
        (module) =>
          `<p class="menu-meta">checked: <code>${escapeHtml(module.id)}</code> → <strong>${escapeHtml(module.derived)}</strong> · not checked: ${escapeHtml(module.not_checked.join(", "))}</p>`,
      )
      .join("")}
    <p class="menu-desc">${escapeHtml(p.not_a_guarantee)}</p>
    <details><summary>the signed object (verify it without asking us)</summary>
    <pre>${escapeHtml(JSON.stringify(passport, null, 2))}</pre></details>
  </section>`;
}

passportRoutes.get("/passport", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const self = await issueSelfPassport(
    c.env,
    new Date(),
    loopbackCatalogFetcher(c),
  );
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json({
      what: "One canonical, signed, expiring object per endpoint: the census's evidence about one host, with a freshness state an agent can act on mechanically. Ready-side hosts only — names appear only on the ready side, everywhere in this store.",
      how: `GET ${base}/passport/{host} — JSON by default, HTML for eyes. Refusals say why (never-observed | not-ready).`,
      freshness_rule: `fresh <= ${FRESH_DAYS}d, aging <= ${AGING_DAYS}d, expired after; broken when the latest verdict is not ready. Refuse expired passports.`,
      the_example: self,
    });
  }
  const bodyHtml = `<section>
    <p class="menu-desc">A passport is ONE object per endpoint: what this
    store's census has observed about a host — verdicts, history, coverage,
    gaps — signed, dated, and <strong>expiring</strong>, with a freshness
    state (<code>fresh / aging / expired / broken / indeterminate</code>) an
    agent can act on without reading prose. It derives from the signed
    corpus; it never re-observes. Passports exist only for hosts whose
    latest observation is on the ready side — the same names line the
    <a href="/fresh-set">fresh set</a> holds.</p>
    <p class="menu-desc">Fetch any observed host's:
    <code>GET ${escapeHtml(base)}/passport/{host}</code>. Free. Evidence
    levels are defined on <a href="/trust">the trust panel</a>; the signature
    verifies per <a href="/spec/scvd-attestation/v1">the spec</a>.</p>
  </section>
  <section><h2>The example: our own, self-observed and labeled as such</h2></section>
  ${passportHtml(self)}`;
  return c.html(
    renderSimplePage({
      title: "Endpoint passports",
      description:
        "One signed, expiring object per endpoint: the census's evidence about a host with a machine-actionable freshness state. Ready-side hosts only.",
      path: "/passport",
      bodyHtml,
    }),
  );
});

passportRoutes.get("/passport/:host", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const rawHost = c.req.param("host").trim().toLowerCase();
  const ownHost = new URL(base).host.toLowerCase();
  const passportOrRefusal =
    rawHost === ownHost
      ? {
          issued: true as const,
          passport: await issueSelfPassport(
            c.env,
            new Date(),
            loopbackCatalogFetcher(c),
          ),
        }
      : await issuePassport(c.env, rawHost);

  if (!passportOrRefusal.issued) {
    const status = passportOrRefusal.reason === "never-observed" ? 404 : 403;
    if (!wantsHtml(c.req.header("Accept"))) {
      return c.json(
        { issued: false, reason: passportOrRefusal.reason, detail: passportOrRefusal.detail },
        status,
      );
    }
    return c.html(
      renderSimplePage({
        title: "No passport",
        description: "No passport issued for this host.",
        path: `/passport/${rawHost}`,
        bodyHtml: `<section><h2>No passport for ${escapeHtml(rawHost)}</h2>
        <p class="menu-desc">${escapeHtml(passportOrRefusal.detail)}</p></section>`,
      }),
      status,
    );
  }

  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json(passportOrRefusal.passport);
  }
  return c.html(
    renderSimplePage({
      title: `Passport: ${rawHost}`,
      description: `The endpoint passport for ${rawHost}: signed census evidence with a freshness state.`,
      path: `/passport/${rawHost}`,
      bodyHtml: passportHtml(passportOrRefusal.passport),
    }),
  );
});
