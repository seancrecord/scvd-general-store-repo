import { Hono } from "hono";
import { renderCardPng } from "@/lib/pixel-card";
import { CATALOG_PATHS } from "@/discovery/self-module";
import { loopbackCatalogFetcher } from "@/lib/self-fetch";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  PASSPORT_CSS,
  cardLines,
  colophonBlock,
  colophonText,
  decisionWord,
  passportCard,
} from "@/pages/passport-card";
import { getMenuItem } from "@/store";
import {
  AGING_DAYS,
  DECISION_MEANING,
  DECISION_RULE,
  FRESH_DAYS,
  decisionOf,
  issuePassport,
  issueSelfPassport,
  type AgentDecision,
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
 *
 * WHAT THE 2026-08-31 OUTSIDE READ CHANGED. The verdict was not that
 * the ingredients were missing — they were all here — but that this
 * page shipped them UNCOMPRESSED: "a hurried agent/operator still has
 * to work too hard to find the one-glance answer." The sharpest
 * instance of that was mechanical rather than editorial. The signed
 * payload has carried `summary` — the whole one-glance read, decided
 * and signed — since 2026-08-27, and THIS PAGE NEVER RENDERED IT. The
 * compressed answer existed in the artifact and a reader could only
 * reach it by expanding a <details> and reading JSON.
 *
 * So the fix is a rendering fix, and every block below is a VIEW OVER
 * THE SIGNED PAYLOAD rather than prose beside it: the decision, the
 * summary rows, the gaps, the limits. Nothing on this page states a
 * date, a status, a payment fact or a correction state that the
 * passport underneath does not state first — which is why the page
 * cannot drift from the instrument no matter how the copy is edited
 * later.
 */
export const passportRoutes = new Hono<HonoEnv>();

/** The one line the read asked to be prominent, and the only claim on
 * this page about what the instrument is FOR. */
const WHAT_IT_FINDS =
  "SCVD finds contradictions between the machine surfaces agents use before they pay.";

/** Every decision word this store can return, with its plain meaning —
 * the legend, straight off the vocabulary the code decides with. */
function decisionLegend(): string {
  const rows = (Object.keys(DECISION_MEANING) as AgentDecision[])
    .map(
      (decision) =>
        `<tr><td><code>${escapeHtml(decision)}</code></td><td>${escapeHtml(DECISION_MEANING[decision])}</td></tr>`,
    )
    .join("");
  return `<section><h2>The agent decision view</h2>
  <p class="menu-desc">Every passport decides one of four words, and the
  decision is arithmetic over the freshness state — no judgement, no
  score, nothing to appeal.</p>
  <table><thead><tr><th>decision</th><th>what it means for you</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <p class="menu-meta">${escapeHtml(DECISION_RULE)}</p></section>`;
}

/** Freshness, expiry and the two refusals, stated where a buyer reads
 * rather than only in the spec. The day counts come off the constants
 * the issuer decides with. */
function semanticsBlock(base: string): string {
  return `<section><h2>Freshness, expiry, and what a refusal means</h2>
  <p class="menu-desc">Evidence in agent commerce rots — payTo addresses,
  prices and manifests all move — so a passport carries its own decay
  schedule and says out loud when to stop believing it. The census walks
  weekly: evidence is <code>fresh</code> inside one cadence
  (${FRESH_DAYS} days), <code>aging</code> inside two (${AGING_DAYS}), and
  <code>expired</code> after. A latest verdict that is not ready reads
  <code>broken</code> whatever its age, and nothing observed at all reads
  <code>indeterminate</code>. <strong>Refuse expired passports</strong> —
  that is the rule the artifact states about itself, and you should hold us
  to it rather than the other way round.</p>
  <p class="menu-desc">Two refusals, and each one says which it is rather
  than returning an empty page. <code>never-observed</code> (404): the
  census has never probed this host, so there is no evidence to passport.
  <code>not-ready</code> (403): the host has been observed and its latest
  observation is not on the ready side — this store publishes names only on
  the ready side, so we say we are refusing and why, and we do not name the
  failure. If you operate the door, the free self-check is
  <code>POST ${escapeHtml(base)}/api/preflight</code>, and it costs nothing
  and needs no account.</p></section>`;
}

/**
 * WHICH PAID THING MOVES WHICH FIELD — the read's request, and a
 * discipline as much as a table: an item that cannot name the field it
 * moves does not belong on a passport page. Names and prices come off
 * the shelf (derived-not-typed), so a repricing cannot leave a wrong
 * number here.
 */
const MOVES_FIELD: { id: string; moves: string; how: string }[] = [
  {
    id: "passport_refresh",
    moves: "summary.observed_at, summary.status, summary.valid_until",
    how: "One fresh observation by the census's own instrument, now instead of Sunday. It folds in wherever it is newest — in BOTH directions, so a door found broken refreshes to a broken passport and a dark chip. The check is bought; the verdict never is.",
  },
  {
    id: "trust_profile",
    moves: "nothing — it hosts the view",
    how: "A standing page at this store's domain aggregating the live passport, the chip and the signed history at one URL an operator can hand to a counterparty. It changes no field: it derives from the same corpus everyone reads free.",
  },
];

function movesFieldBlock(): string {
  const rows = MOVES_FIELD.flatMap((entry) => {
    const item = getMenuItem(entry.id);
    if (!item) return [];
    return [
      `<tr>
        <td><a href="/menu/${escapeHtml(item.id)}">${escapeHtml(item.name)}</a><br>
        <span class="menu-meta">$${escapeHtml(String(item.price_usdc))}</span></td>
        <td><code>${escapeHtml(entry.moves)}</code></td>
        <td>${escapeHtml(entry.how)}</td>
      </tr>`,
    ];
  }).join("");
  if (rows === "") return "";
  return `<section><h2>What a paid item moves</h2>
  <p class="menu-desc">Reading a passport is free forever, and stays free.
  What is for sale is freshness and hosting — never the verdict. Each item
  names the field it moves, because an item that cannot name one has no
  business on this page.</p>
  <table><thead><tr><th>item</th><th>field it moves</th><th>how</th></tr></thead>
  <tbody>${rows}</tbody></table></section>`;
}

/**
 * THE WALKTHROUGH (outside review, 2026-08-27, accepted): "here is
 * how SCVD checks itself," readable, on the landing the noun already
 * owns. It NARRATES the live self-passport — the surface list is the
 * walk's own CATALOG_PATHS and each verdict/hash is the live
 * module's — so the prose cannot drift from the instrument. Module
 * ids the readings table does not know get the honest generic line
 * rather than silence.
 *
 * It sits BELOW the example now rather than above it. The walk is the
 * credibility argument and it is worth reading; it is not what a
 * hurried operator came for, and it was standing between them and the
 * passport.
 */
const MODULE_READINGS: Record<string, string> = {
  discovery_coherence:
    "Do the machine surfaces agents read before paying agree with each other? The walk pulls every claim these catalogs make about the same doors — prices, rails, paths — and compares them. A contradiction between surfaces is exactly the kind of defect this store exhibits on others, so it looks for it here first.",
  schema_coherence:
    "Do the schemas these surfaces declare for the same tool agree? A tool whose MCP declaration, OpenAPI contract and catalog entry describe different inputs will break an agent that trusted whichever it read first. Same comparison, on ourselves.",
};

function walkthroughHtml(passport: EndpointPassport): string {
  const surfaces = Object.values(CATALOG_PATHS)
    .map(
      (path) =>
        `<a href="${escapeHtml(path)}"><code>${escapeHtml(path)}</code></a>`,
    )
    .join(" · ");
  const modules = passport.payload.modules
    .map((module) => {
      const reading =
        MODULE_READINGS[module.id] ??
        "No reading written for this module yet; its own not_checked and does_not_prove lists below are the honest boundary of what it claims.";
      return `<section data-walkthrough="${escapeHtml(module.id)}">
      <h3><code>${escapeHtml(module.id)}</code> → <strong>${escapeHtml(module.derived)}</strong></h3>
      <p class="menu-desc">${escapeHtml(reading)}</p>
      <p class="menu-meta">evidence hash <code>${escapeHtml(module.evidence_hash.slice(0, 12))}…</code> —
      the canonical bytes of what was compared, hashed, so this page and the signed object cannot quietly disagree.
      Not checked: ${escapeHtml(module.not_checked.join("; ") || "—")}.
      Does not prove: ${escapeHtml(module.does_not_prove.join("; ") || "—")}.</p>
      </section>`;
    })
    .join("\n");
  return `<section>
    <h2>How this store checks itself</h2>
    <p class="menu-desc">Every check this store sells runs on ourselves first,
    and this is the walk, live: on each request to this page the store fetches
    its own machine surfaces — ${surfaces} — extracts the claims they make
    about the same doors, and compares. The verdicts below are not a cached
    grade; they were derived while this page rendered, and the signed object
    underneath carries the same values.</p>
    ${modules}
    <p class="menu-desc">Nothing here needs trusting: every surface named
    above is public, so you can fetch them and re-check the comparison with
    your own tools — which is the only reason a self-issued passport is worth
    serving at all.</p>
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
      decision_rule: DECISION_RULE,
      decision_meaning: DECISION_MEANING,
      read_first: "payload.summary — the whole one-glance read, inside the signature.",
      the_example: self,
    });
  }
  const bodyHtml = `<section>
    <p class="menu-desc"><strong>An Endpoint Passport is the pre-pay
    evidence object for one host</strong>: what this store observed, what it
    did not observe, how fresh that evidence is, what failed, and where to
    verify the signed record. One object, signed, dated, and
    <strong>expiring</strong> — with a decision an agent can act on without
    reading a word of this page.</p>
    <p class="menu-desc">${escapeHtml(WHAT_IT_FINDS)} A passport is the
    agent's pre-pay view over that evidence; <a href="/corpus">the Corpus</a>
    is the weekly anchored record underneath it — the spine researchers,
    verifiers and future observers cite. The passport derives from the
    corpus and never re-observes.</p>
    <p class="menu-desc">Read one: <code>GET ${escapeHtml(base)}/passport/{host}</code>
    — JSON by default, HTML for eyes, free, no account, no API key. The
    field to read first is <code>summary</code>, which rides inside the
    signature. Passports exist only for hosts whose latest observation is on
    the ready side — the same names the <a href="/fresh-set">fresh set</a>
    holds.</p>
  </section>
  ${decisionLegend()}
  <section>
    <h2>The worked example: our own passport, self-observed and labeled so</h2>
    <p class="menu-desc">This store checking itself is the whole credibility
    argument, so it is the first passport on the page rather than the last.
    It is issued live on this request — every field below was derived while
    this page rendered, and it goes dark exactly the way anyone else's does.
    The walk that produced it is <a href="#self-walk">below</a>.</p>
  </section>
  ${passportCard(self)}
  ${semanticsBlock(base)}
  ${movesFieldBlock()}
  <section id="self-walk">${walkthroughHtml(self)}</section>`;
  return c.html(
    renderSimplePage({
      title: "Endpoint passports",
      description:
        "The pre-pay evidence object for one host: what SCVD observed, what it did not observe, how fresh it is, what failed, and where to verify the signed record. One signed, expiring object with a machine-actionable decision. Free.",
      path: "/passport",
      extraCss: PASSPORT_CSS,
      bodyHtml,
    }),
  );
});

/**
 * THE SHARE CARD (2026-09-02): the passport's dates, drawn. Served per
 * host at request time, cached a day; a host with no passport gets the
 * same refusal the page gives — a card for an unobserved host would be
 * a picture of nothing wearing our name.
 */
passportRoutes.get("/passport/card/:host{.+\\.png}", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const rawHost = c.req.param("host").replace(/\.png$/, "").trim().toLowerCase();
  const ownHost = new URL(base).host.toLowerCase();
  const outcome =
    rawHost === ownHost
      ? {
          issued: true as const,
          passport: await issueSelfPassport(c.env, new Date(), loopbackCatalogFetcher(c)),
        }
      : await issuePassport(c.env, rawHost);
  if (!outcome.issued) {
    return c.json(
      { issued: false, reason: outcome.reason, detail: outcome.detail },
      outcome.reason === "never-observed" ? 404 : 403,
    );
  }
  return c.body(renderCardPng(cardLines(outcome.passport)).buffer as ArrayBuffer, 200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=86400",
  });
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
        {
          issued: false,
          reason: passportOrRefusal.reason,
          detail: passportOrRefusal.detail,
          /* A refusal is a decision too, and an agent that only reads
           * `decision` should not have to special-case the 403/404 to
           * learn it must not act. */
          decision: decisionOf("indeterminate"),
          decision_meaning: DECISION_MEANING["INDETERMINATE"],
        },
        status,
      );
    }
    return c.html(
      renderSimplePage({
        title: "No passport",
        description: "No passport issued for this host.",
        path: `/passport/${rawHost}`,
        extraCss: PASSPORT_CSS,
        bodyHtml: `<section><h2>No passport for ${escapeHtml(rawHost)}</h2>
        ${decisionWord("INDETERMINATE")}
        <p class="menu-desc">${escapeHtml(passportOrRefusal.detail)}</p></section>`,
      }),
      status,
    );
  }

  if (!wantsHtml(c.req.header("Accept"))) {
    /* Additive, outside the signed payload, like verify_hint: the
     * words a merchant may paste, derived from the summary they sit
     * beside. */
    return c.json({
      ...passportOrRefusal.passport,
      colophon: colophonText(passportOrRefusal.passport, base),
    });
  }
  return c.html(
    renderSimplePage({
      title: `Passport: ${rawHost}`,
      description: `The endpoint passport for ${rawHost}: what this store observed, what it did not, how fresh the evidence is, and where to verify the signed record.`,
      path: `/passport/${rawHost}`,
      extraCss: PASSPORT_CSS,
      ogImage: `${base}/passport/card/${rawHost}.png`,
      bodyHtml: `${passportCard(passportOrRefusal.passport)}
      ${colophonBlock(passportOrRefusal.passport, base)}
      <section><p class="menu-desc">What a passport is, the four decisions it
      can return, and the expiry rule that governs this one:
      <a href="/passport">the passport landing</a>. Reading is free forever.</p></section>`,
    }),
  );
});
