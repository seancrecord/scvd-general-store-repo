import type {
  MetricEvent,
  MonthLedger,
  PorchLedger,
  SettleReconciliation,
} from "@/lib/metrics";
import { escapeHtml } from "@/lib/sanitize";
import { registeredMarkers, UNREGISTERED_VENUE } from "@/store/venues";
import { readWindowShopping } from "@/lib/window-shopping";
import { porchSurfaceKind, type PorchSurfaceKind } from "@/lib/porch-surface";
import { renderAdminShell } from "@/pages/admin/layout";
import { isRecord } from "@/types";
import type { TakeSummary } from "@/services/books-summary";
import type { FieldWalletReading } from "@/services/field-wallet";
import type { TillItemCount } from "@/services/stats";
import { minimumUsdcForPath } from "@/lib/payments";
import type { BazaarLedgerEntry, GazetteIssue, PayerRecord } from "@/types";

/**
 * The desk: analytics front and center, because that's what the
 * keeper opens the office for. Month at a glance, the trend, sources
 * differentiated and interpreted, then the item ledger; diagnostics
 * fold away below. Work waiting shows as one strip up top with a
 * door to the counter.
 */

export interface MoneyOut {
  wallet: FieldWalletReading | null;
  openBounties: number | null;
  spentThisWeekUsd: number | null;
  weeklyBudgetUsd: number | null;
  /** Signed payouts a recipient can still redeem, in USD. */
  outstandingUsd: number | null;
}

/** The paying wallet and the board's promises against it, one line. */
function moneyOutHtml(money: MoneyOut | null | undefined): string {
  if (!money) {
    return `<p><strong>Money out:</strong> not read here — <a href="/admin/bounties">the bounty board</a> has the wallet and every claim.</p>`;
  }
  const wallet = money.wallet;
  const walletText = !wallet
    ? "the paying wallet was not read in time (the desk waits three seconds, no longer)"
    : !wallet.provisioned || !wallet.address
      ? "no paying wallet on this deployment"
      : wallet.usdc === null
        ? `field wallet <code>${escapeHtml(wallet.address.slice(0, 10))}…</code> balance <strong>not read</strong> <small>(${escapeHtml(wallet.problem ?? "")})</small>`
        : `field wallet <code>${escapeHtml(wallet.address.slice(0, 10))}…</code> holds <strong>$${wallet.usdc.toFixed(2)} USDC</strong> on Base`;
  const bounties =
    money.openBounties === null
      ? "the board was not read"
      : `<strong>${money.openBounties}</strong> open bount${money.openBounties === 1 ? "y" : "ies"}`;
  const budget =
    money.spentThisWeekUsd === null || money.weeklyBudgetUsd === null
      ? ""
      : ` · $${money.spentThisWeekUsd.toFixed(2)} of $${money.weeklyBudgetUsd.toFixed(2)} spent this week`;
  const outstanding =
    money.outstandingUsd === null
      ? ""
      : ` · $${money.outstandingUsd.toFixed(2)} in signed payouts still redeemable`;
  const short =
    wallet?.usdc !== null &&
    wallet?.usdc !== undefined &&
    money.outstandingUsd !== null &&
    money.outstandingUsd > wallet.usdc
      ? ` <strong style="color:#8c2f1b">— short: promised more than it holds</strong>`
      : "";
  return `<p><strong>Money out:</strong> ${walletText} · ${bounties}${budget}${outstanding}${short}.
    <small>Every claim presented and where it went: <a href="/admin/bounties">the bounty board</a>.</small></p>`;
}

/**
 * VISIBILITY (2026-09-04): which of our doors the CDP search index
 * returned on the latest Sunday round, and the exact press that puts
 * a missing one back. Null when no round has run.
 */
export interface Visibility {
  week: string;
  at: string;
  claimed: number;
  found: number;
  missing: string[];
  could_not_check: boolean;
  command: string;
  cost_usd: number;
}

function visibilityHtml(visibility: Visibility | null | undefined): string {
  if (!visibility) {
    return `<p><strong>Visibility:</strong> no Sunday round has run yet, so nothing here is known.</p>`;
  }
  if (visibility.could_not_check) {
    return `<p><strong>Visibility:</strong> the CDP search index could not be read on the ${escapeHtml(visibility.week)} round — a gap in our vantage, not a miss. <a href="/admin/ward">The ward</a> has the round.</p>`;
  }
  if (visibility.missing.length === 0) {
    return `<p><strong>Visibility:</strong> <strong style="color:#2f6b2f">${visibility.found} of ${visibility.claimed}</strong> payable doors in the CDP search index on the ${escapeHtml(visibility.week)} round. Every door an agent can search for, it can find.</p>`;
  }
  return `<p><strong>Visibility:</strong> <strong style="color:#8c2f1b">${visibility.found} of ${visibility.claimed}</strong> payable doors in the CDP search index on the ${escapeHtml(visibility.week)} round; missing: ${visibility.missing.map((id) => `<code>${escapeHtml(id)}</code>`).join(", ")}.
    The index lists a door when the facilitator settles one real payment for it, so the press is one house purchase per missing door, about $${visibility.cost_usd.toFixed(3)} for the lot, from a listed house wallet on a machine with the key:</p>
    <pre>${escapeHtml(visibility.command)}</pre>
    <p><small>Re-read every Sunday; the email says the same until the index finds them again. REGISTRATION_RUN.md has the full run.</small></p>`;
}

export interface OfficePageData {
  monthLedger: MonthLedger;
  porchLedger: PorchLedger;
  /**
   * WHO KNOCKED AT THE MCP DOOR, by the name each client announced.
   * Empty until the first handshake after this shipped — the census
   * starts from its own deploy, like the porch table above it.
   */
  mcpClients?: Record<string, number>;
  payers: PayerRecord[];
  recentChallenges: MetricEvent[];
  /**
   * THE TAKE: all-time real money off the certificates, split by
   * shelf kind, rolling up to a total. First on the page because the
   * keeper kept reading the month number first and thinking the
   * books were wrong — the month is a slice; this is the number.
   */
  take: TakeSummary | null;
  /**
   * All-time organic/house settle counts, same computation the public
   * pages use. Beside the month numbers because on 2026-08-01 the
   * desk said 1 while the storefront said 2 — both correct, July's
   * sale had rolled out of the desk's unlabeled month window at
   * midnight UTC, and the keeper rightly read it as data loss. A
   * window states itself (AT_SCALE rule 4), especially at the desk.
   */
  allTime: { organic: number; house: number } | null;
  /**
   * When the take above was read. The desk's headline table comes
   * from the hourly glance now rather than from a walk this request
   * paid for, and a cached number that does not say so is exactly
   * the kind of claim this store spends its time refusing.
   */
  takeReadAt?: string | null;
  /** Settle counters against payer rows, all-time on both sides. */
  reconciliation: SettleReconciliation | null;
  /**
   * This month's slice of the house-reclassification ledger, derived
   * from certificates (earliest N per frozen wallet). Applied at read
   * to the month line — the raw counters stay exactly as written, and
   * the adjustment shows itself instead of hiding in the arithmetic.
   */
  monthReclass: { settles: number; usdc: number } | null;
  bazaarLedger: BazaarLedgerEntry[];
  gazetteIssues: GazetteIssue[];
  /** Pending work counts for the strip. */
  work: { orders: number; letters: number; reviews: number; alerts: number };
  /**
   * MONEY OUT (2026-09-04): what the paying wallet holds, read off the
   * chain, against what the bounty board has promised. Null fields
   * are "not read here", never zero — the desk keeps its three-second
   * leash on the chain and the bounty board page takes the full wait.
   */
  moneyOut?: MoneyOut | null;
  /** Our doors in the CDP index on the latest round, and the press. */
  visibility?: Visibility | null;
  /** Every almanac page, compiled and office-written, for the want table. */
  almanacSlugs: readonly string[];
  loadNotes: string[];
}

/** Plain-English channel legend, for planning, not decoration. */
const CHANNEL_MEANING: Record<string, string> = {
  direct:
    "came straight to a URL, no referrer: bookminded agents, scripts, or anyone who already knew the address",
  skill:
    "arrived through the ClawHub skill (?src=clawhub-skill): the skill listing is working",
  mcp: "tool-calling agents through the /mcp door: definitive, not inferred",
  bazaar:
    "referred by the x402 Bazaar / x402scan catalog: discovery is working",
  unknown: "no user-agent and no referrer: bare fetches, hard to plan around",
  infrastructure:
    "known crawlers and scanners: the noise floor, never counted as customers",
};

/** The funnel: porch visits -> 402s -> settles, per channel, organic only. */
function sourcesHtml(ledger: MonthLedger, porch: PorchLedger): string {
  const porchByChannel: Record<string, number> = {};
  for (const buckets of Object.values(porch.surfaces)) {
    for (const [key, count] of Object.entries(buckets)) {
      if (key.startsWith("organic:")) {
        const channel = key.slice(8);
        porchByChannel[channel] = (porchByChannel[channel] ?? 0) + count;
      }
    }
  }
  const channels = [
    ...new Set([
      ...Object.keys(porchByChannel),
      ...Object.keys(ledger.channels402),
      ...Object.keys(ledger.channels),
    ]),
  ].filter((channel) => channel !== "infrastructure");
  const rows =
    channels.length === 0
      ? '<tr><td colspan="5">No organic traffic on the books yet this month.</td></tr>'
      : channels
          .map((channel) => {
            const visits = porchByChannel[channel] ?? 0;
            const challenges = ledger.channels402[channel] ?? 0;
            const settles = ledger.channels[channel] ?? 0;
            const conversion =
              challenges > 0
                ? `${Math.round((settles / challenges) * 100)}%`
                : "n/a";
            return `<tr><td><strong>${escapeHtml(channel)}</strong></td>
              <td>${visits}</td><td>${challenges}</td><td>${settles}</td><td>${conversion}</td></tr>`;
          })
          .join("\n");
  const venueLines = Object.entries(ledger.venues)
    .map(([venue, count]) => `${escapeHtml(venue)}: ${count}`)
    .join(" \u00B7 ");
  const legend = channels
    .concat(["infrastructure"])
    .filter((channel) => CHANNEL_MEANING[channel])
    .map(
      (channel) =>
        `<li><strong>${escapeHtml(channel)}</strong>: ${escapeHtml(CHANNEL_MEANING[channel] ?? "")}</li>`,
    )
    .join("\n");
  return `
    <table border="1" cellpadding="4">
      <tr><th>source</th><th>porch visits</th><th>402s</th><th>settles</th><th>conversion</th></tr>
      ${rows}
    </table>
    <p>Organic only; infrastructure and house are kept out of every column. Read it left to right: who shows up, who reaches a shelf, who pays.</p>
    <p><small>Off the books but on file: house settles ${
      Object.entries(ledger.channelsHouse)
        .map(([channel, count]) => `${escapeHtml(channel)}: ${count}`)
        .join(" \u00B7 ") || "none"
    } \u00B7 infrastructure 402s ${
      Object.entries(ledger.channels402Infra)
        .map(([channel, count]) => `${escapeHtml(channel)}: ${count}`)
        .join(" \u00B7 ") || "none"
    }</small></p>
    <p><strong>Venue markers (?src=)</strong>: ${venueLines || "none yet; they appear when papers get handed out with per-venue markers"}</p>
    <p><small><strong>WHAT THIS TABLE CANNOT SEE, and it is not the same gap in both halves.</strong>
    The <em>source</em> column above infers <code>bazaar</code> from a REFERRER, and machine
    clients overwhelmingly send none — a directory-referred agent is indistinguishable
    from a bookmark and lands in <code>direct</code>. So a zero in the bazaar row is zero
    ATTRIBUTABLE arrivals and says nothing about zero arrivals. The venue line beside it
    has the opposite problem and it is ours: <code>?src=</code> needs no referrer and works
    fine on a bare machine client, but it only counts markers we actually minted. The
    register holds ${registeredMarkers().length}
    (<code>${registeredMarkers().map(escapeHtml).join("</code>, <code>")}</code>), and
    everything else folds into <code>${escapeHtml(UNREGISTERED_VENUE)}</code> — one bucket,
    deliberately, because this used to take any string a caller invented and mint a KV key
    from it. A venue with a marker but no arrivals means the paper was never handed out;
    it does not mean nobody read it. Neither number is evidence about directory traffic,
    and reading either as evidence is the mistake this note exists to stop
    (<code>AT_SCALE.md</code> rule 5b).</small></p>
    <p><small>Rows predating the register keep their own names — old keys are read as
    written, so a historical one-off like <code>workcheck-persona-test</code> still shows
    itself. Only new writes are bucketed, and the exact string always survives per-event
    under <a href="/admin/item-events">item events</a>.</small></p>
    <details><summary>What each source means</summary><ul>${legend}</ul></details>`;
}

/** Last 14 days with any traffic: 402s vs settles, organic. */
function trendHtml(ledger: MonthLedger): string {
  const days = Object.entries(ledger.days).sort((a, b) =>
    b[0].localeCompare(a[0]),
  );
  if (days.length === 0) {
    return "<p>No day-level rows yet; the trend starts counting from this deploy.</p>";
  }
  const rows = days
    .slice(0, 14)
    .map(
      ([day, counts]) =>
        `<tr><td>${escapeHtml(ledger.month)}-${escapeHtml(day)}</td><td>${counts.challenges}</td><td>${counts.settles}</td><td>${"\u25A0".repeat(Math.min(counts.settles, 40)) || ""}</td></tr>`,
    )
    .join("\n");
  return `
    <table border="1" cellpadding="4">
      <tr><th>day</th><th>organic 402s</th><th>organic settles</th><th></th></tr>
      ${rows}
    </table>`;
}

/**
 * The all-time money table, by shelf kind, total at the bottom.
 * Certificates are the source (same rows as the tax drawer), so
 * every dollar here is chain-verifiable — and the same caveats
 * apply, stated under the table rather than assumed known.
 */
/**
 * Exported 2026-08-28 so /admin/take can render the same table the
 * desk used to. One function, two callers — the alternative was a
 * second copy of the store's money table, which is the exact defect
 * class this repo spends its time closing.
 */
export function takeSectionHtml(
  take: TakeSummary | null,
  allTime: { organic: number; house: number } | null,
  till: Record<string, TillItemCount> | null = null,
): string {
  if (!take) {
    return "<p>The take didn't load. Reload to retry.</p>";
  }
  /**
   * THE BRIDGE LINE: the keeper hit "the front says 5, this says 4"
   * twice in one day, and both times the answer was the same — the
   * storefront counts settles at the till (penny pages included),
   * this table counts certificates. A page that makes the reader do
   * that subtraction twice is the page's fault. If the counts differ
   * by anything penny pages cannot explain, it says so in red.
   */
  const bridge = (() => {
    if (!allTime) return "";
    const diff = allTime.organic - take.total.organic_sales;
    if (diff === 0) {
      return `<p><small>The storefront's organic figure matches this table exactly right now (${allTime.organic}).</small></p>`;
    }
    if (diff > 0) {
      return `<p><small><strong>Why the storefront says ${allTime.organic} and this table says ${take.total.organic_sales}:</strong> the storefront counts settles at the till; this table counts certificates. The difference — ${diff} — is settles that minted no certificate, listed by item under <a href="#no-certificate">settled at the till, no certificate</a> below. Same books, two honest counts, and now both on the page.</small></p>`;
    }
    return `<p><small><strong style="color:#8c2f1b">The counters show FEWER organic settles (${allTime.organic}) than there are organic certificates (${take.total.organic_sales}). Penny pages cannot explain a negative gap — this is worth chasing.</strong></small></p>`;
  })();
  const money = (value: number): string => `$${value.toFixed(2)}`;
  const rows = take.lines
    .map(
      (line) => `<tr>
        <td>${escapeHtml(line.label)}</td>
        <td><strong>${money(line.organic_usdc)}</strong> (${line.organic_sales})</td>
        <td>${money(line.house_usdc)} (${line.house_sales})</td>
      </tr>`,
    )
    .join("\n");
  const t = take.total;
  const rail = (slice: { sales: number; usdc: number }, label: string): string =>
    `<strong>${slice.sales}</strong> on ${label} for <strong>${money(slice.usdc)}</strong>`;
  return `
    <p style="font-size:1.25em"><strong>${money(t.organic_usdc)}</strong> organic, all-time
    <small>(+${money(t.house_usdc)} house)</small> ·
    <strong>${t.organic_sales}</strong> organic sale${t.organic_sales === 1 ? "" : "s"}</p>
    <p>${rail(take.rails.base, "Base")} · ${rail(take.rails.solana, "Solana")}${take.rails.unknown.sales > 0 ? ` · ${rail(take.rails.unknown, "an unrecorded rail")}` : ""} <small>(organic only, by each certificate's network)</small></p>
    ${bridge}
    <table border="1" cellpadding="4">
      <tr><th>shelf</th><th>organic (sales)</th><th>house (sales)</th></tr>
      ${rows}
      <tr>
        <td><strong>Total</strong></td>
        <td><strong>${money(t.organic_usdc)}</strong> (${t.organic_sales})</td>
        <td><strong>${money(t.house_usdc)}</strong> (${t.house_sales})</td>
      </tr>
    </table>
    <h3>By item, all-time</h3>
    <table border="1" cellpadding="4">
      <tr><th>item</th><th>organic (sales)</th><th>house (sales)</th></tr>
      ${
        take.items.length === 0
          ? '<tr><td colspan="3">No certificates yet.</td></tr>'
          : take.items
              .map(
                (line) => `<tr>
        <td>${escapeHtml(line.label)} <small><code>${escapeHtml(line.item)}</code></small></td>
        <td><strong>${money(line.organic_usdc)}</strong> (${line.organic_sales})</td>
        <td>${money(line.house_usdc)} (${line.house_sales})</td>
      </tr>`,
              )
              .join("\n")
      }
    </table>
    <p><small>Off the certificates — every dollar verifiable by its tx in
    <a href="/admin/files">the keeper's files</a>. Tips counted with their
    sales; ${take.refund_usdc > 0 ? `$${take.refund_usdc.toFixed(2)} of refunds netted out` : "no refunds to net"};
    ${take.unknown_wallet_sales > 0 ? `${take.unknown_wallet_sales} sale${take.unknown_wallet_sales === 1 ? "" : "s"} arrived without a wallet address and count as organic` : "every sale carries its wallet"}.
    Penny pages (Almanac) mint no certificates and are not in this table.${take.truncated ? " <strong>Cert scan hit its cap; totals are a floor.</strong>" : ""}</small></p>
    ${noCertificateHtml(take, allTime, till)}`;
}

/**
 * SETTLED AT THE TILL, NO CERTIFICATE (2026-09-02; the keeper, on
 * "the take says 21, organic says 23": "why wouldn't we show both").
 * The till counts every settle by item; the take counts certificates
 * by item. Subtract, per item, and what is left is the money the
 * certificate walk cannot see: the penny pages by design, and — if it
 * ever happens — a shelf item that settled and minted nothing, which
 * is the one row here that should never be green. Then the two
 * totals are added back together in front of the reader, so the
 * storefront's number is arrived at on the page rather than explained
 * in a footnote.
 *
 * Money for a no-certificate row is the LIST price times the count:
 * the till records that a settle happened, not what was paid, and the
 * chain on the receiving wallets is the amount's backstop, same as the
 * tax drawer says. Counts are raw till counters; the reclassification
 * ledger moves family settles to house in the totals only and cannot
 * say which item they were on, so a remainder is printed rather than
 * absorbed.
 */
/**
 * THE ROWS, DERIVED WITHOUT TRUSTING EITHER CLASSIFICATION (2026-09-02,
 * the keeper: "something is very incorrect here"). The first version
 * subtracted organic certificates from organic till counts and house
 * from house. But the till classifies a settle when it happens and a
 * certificate is classified when it is READ, against today's
 * house-wallet list — so every settle the reclassification ledger
 * later moved from organic to house showed up here as an organic sale
 * with no certificate, in red, with "chase it" beside it. Nineteen of
 * twenty-one rows were that ledger wearing a missing certificate.
 *
 * So the difference is taken on the TOTAL per item, which neither
 * classification can move: settles the till booked, less certificates
 * that exist, is the count with no certificate behind it. The ledger's
 * effect is then printed as its own named number per item — settles
 * the till booked organic that certificates now class house — and
 * only what is left after that reads as organic money with nothing
 * behind it. A house row with no certificate is the proprietors' own
 * test or a failed mint on our own wallet, said in those words rather
 * than in red.
 */
export interface NoCertificateRow {
  item: string;
  booked: number;
  certificates: number;
  no_certificate: number;
  moved_to_house_since_booking: number;
  organic_no_certificate: number;
  house_no_certificate: number;
  list_price: number;
  penny_page: boolean;
}

export function noCertificateRows(
  take: TakeSummary,
  till: Record<string, TillItemCount>,
): NoCertificateRow[] {
  const certs = new Map(
    take.items.map((line) => [
      line.item,
      { organic: line.organic_sales, house: line.house_sales },
    ]),
  );
  return Object.entries(till)
    .map(([item, count]) => {
      const cert = certs.get(item) ?? { organic: 0, house: 0 };
      const booked = count.organic + count.house;
      const certificates = cert.organic + cert.house;
      const noCertificate = Math.max(0, booked - certificates);
      const moved = Math.max(0, cert.house - count.house);
      const organicNoCert = Math.min(
        noCertificate,
        Math.max(0, count.organic - cert.organic - moved),
      );
      // A penny page's till key is its path with colons for slashes.
      const path = item.includes(":") ? `/${item.replace(/:/g, "/")}` : `/api/buy/${item}`;
      const listPrice = minimumUsdcForPath(path);
      return {
        item,
        booked,
        certificates,
        no_certificate: noCertificate,
        moved_to_house_since_booking: moved,
        organic_no_certificate: organicNoCert,
        house_no_certificate: noCertificate - organicNoCert,
        list_price: listPrice,
        penny_page: item.includes(":") && listPrice > 0,
      };
    })
    .filter((row) => row.no_certificate > 0)
    .sort(
      (a, b) =>
        b.organic_no_certificate - a.organic_no_certificate ||
        b.no_certificate - a.no_certificate ||
        a.item.localeCompare(b.item),
    );
}

function noCertificateHtml(
  take: TakeSummary,
  allTime: { organic: number; house: number } | null,
  till: Record<string, TillItemCount> | null,
): string {
  if (!till) {
    return `<h3 id="no-certificate">Settled at the till, no certificate</h3>
    <p><small>The per-item till counters are not cached on the desk; <a href="/admin/take">the take</a> walks them and derives these rows.</small></p>`;
  }
  const rows = noCertificateRows(take, till);
  const money = (value: number): string => `$${value.toFixed(2)}`;
  const noCertOrganic = rows.reduce((sum, row) => sum + row.organic_no_certificate, 0);
  const noCertHouse = rows.reduce((sum, row) => sum + row.house_no_certificate, 0);
  const movedTotal = Object.entries(till).reduce((sum, [item, count]) => {
    const line = take.items.find((entry) => entry.item === item);
    return sum + Math.max(0, (line?.house_sales ?? 0) - count.house);
  }, 0);
  const table =
    rows.length === 0
      ? "<p>Every settle on the till has a certificate behind it.</p>"
      : `<table border="1" cellpadding="4">
      <tr><th>item</th><th>booked at the till</th><th>certificates</th><th>no certificate</th><th>of which organic today</th><th>moved to house since booking</th><th>why</th></tr>
      ${rows
        .map(
          (row) => `<tr>
        <td><code>${escapeHtml(row.item)}</code></td>
        <td>${row.booked}</td>
        <td>${row.certificates}</td>
        <td><strong>${row.no_certificate}</strong> (${money(row.no_certificate * row.list_price)} at list)</td>
        <td>${row.organic_no_certificate > 0 ? `<strong>${money(row.organic_no_certificate * row.list_price)}</strong> (${row.organic_no_certificate})` : "0"}</td>
        <td>${row.moved_to_house_since_booking}</td>
        <td>${
          row.penny_page
            ? `penny page at ${money(row.list_price)} list; delivers the page, mints nothing`
            : row.organic_no_certificate > 0
              ? `<strong style="color:#8c2f1b">organic money with no certificate behind it — a mint that failed, or a settle that bought nothing. Chase it.</strong>`
              : `house: the proprietors' own settles with no certificate behind them — a test, or a mint that failed on our own wallet. Not a customer's money.`
        }</td>
      </tr>`,
        )
        .join("\n")}
      <tr>
        <td><strong>No certificate, total</strong></td>
        <td></td>
        <td></td>
        <td><strong>${noCertOrganic + noCertHouse}</strong></td>
        <td><strong>(${noCertOrganic})</strong></td>
        <td>${movedTotal}</td>
        <td></td>
      </tr>
    </table>`;
  const reconcile = (() => {
    if (!allTime) return "";
    const explained = take.total.organic_sales + noCertOrganic;
    const remainder = allTime.organic - explained;
    const sum = `${take.total.organic_sales} on certificates + ${noCertOrganic} with no certificate = ${explained}`;
    if (remainder === 0) {
      return `<p><strong>${sum}</strong>, which is the storefront's ${allTime.organic}. The books reconcile.${movedTotal > 0 ? ` (${movedTotal} settle${movedTotal === 1 ? "" : "s"} the till booked organic now class house by today's wallet list — the reclassification ledger, shown per item above rather than counted as missing money.)` : ""}</p>`;
    }
    if (remainder > 0) {
      return `<p><strong style="color:#8c2f1b">${sum}, but the storefront says ${allTime.organic}: ${remainder} organic settle${remainder === 1 ? "" : "s"} unaccounted for.</strong> Neither the certificates nor the till's per-item rows carry ${remainder === 1 ? "it" : "them"}; the chain on the receiving wallets is where to look.</p>`;
    }
    return `<p><strong>${sum}</strong>, against the storefront's ${allTime.organic}: ${-remainder} more here than there. The storefront applies the reclassification ledger to its total and the certificates apply today's wallet list per row; ${movedTotal} settle${movedTotal === 1 ? "" : "s"} moved to house since booking are shown per item above. What is left over is not extra money; if it is not that ledger, the chain on the receiving wallets is where to look.</p>`;
  })();
  return `<h3 id="no-certificate">Settled at the till, no certificate</h3>
    <p><small>The till counts every settle by item when it happens; certificates are classified when they are read, against today's house-wallet list. So the difference is taken on the total per item — booked less certificates — and the reclassification ledger's effect is printed as its own column instead of reading as missing money. Amounts are list price × count: the till records that a settle happened, not what was paid, and the chain on the receiving wallets is the backstop.</small></p>
    ${table}
    ${reconcile}`;
}

function glanceHtml(data: OfficePageData): string {
  const ledger = data.monthLedger;
  const reclass = data.monthReclass;
  const rawSettles = Object.values(ledger.items).reduce(
    (sum, row) => sum + row.settled,
    0,
  );
  // The reclassification ledger, applied at read — the same correction
  // /stats carries, sliced to this month. Raw counters stay as
  // written; the note under the line shows the move in the open.
  const organicSettles = Math.max(0, rawSettles - (reclass?.settles ?? 0));
  const revenueUsdc = Math.max(0, ledger.revenueUsdc - (reclass?.usdc ?? 0));
  const revenueHouseUsdc = ledger.revenueHouseUsdc + (reclass?.usdc ?? 0);
  const organic402s = Object.values(ledger.items).reduce(
    (sum, row) => sum + row.challenges,
    0,
  );
  const reclassNote =
    reclass && reclass.settles > 0
      ? `<p><small>After the reclassification ledger: ${reclass.settles} settle${reclass.settles === 1 ? "" : "s"} and $${reclass.usdc.toFixed(2)} this month moved organic → house (walker wallets listed late; story at /corrections). The raw counters are untouched — this line does the subtraction in the open.</small></p>`
      : "";
  return `
    <p style="font-size:1.15em">
      <strong>${escapeHtml(ledger.month)}:</strong>
      <strong>$${revenueUsdc.toFixed(2)}</strong> organic revenue
      <small>(+$${revenueHouseUsdc.toFixed(2)} house)</small> \u00B7
      <strong>${organicSettles}</strong> organic settle${organicSettles === 1 ? "" : "s"} \u00B7
      <strong>${organic402s}</strong> organic 402s \u00B7
      <strong>${data.payers.length}</strong> paying wallet${data.payers.length === 1 ? "" : "s"} <small>(all-time)</small> \u00B7
      <strong>${data.porchLedger.organicVisits}</strong> organic porch visits
      ${data.porchLedger.porchToPurchase !== null ? `\u00B7 porch-to-purchase <strong>${data.porchLedger.porchToPurchase}</strong>` : ""}
    </p>
    ${reclassNote}
    ${
      data.allTime
        ? `<p style="font-size:1.05em"><strong>All-time:</strong> <strong>${data.allTime.organic}</strong> organic settle${data.allTime.organic === 1 ? "" : "s"} <small>(+${data.allTime.house} house)</small> \u2014 the number the storefront and /stats publish. The month line above resets when the calendar turns; this one never does.</p>`
        : ""
    }
    <p><small>Revenue counts from this deploy forward (the founding fifty cents predates the meter). House money is real money; it just doesn't count as proof.</small></p>`;
}

function ledgerAnswersHtml(ledger: MonthLedger, payers: PayerRecord[]): string {
  const items = Object.entries(ledger.items);
  const rows =
    items.length === 0
      ? '<tr><td colspan="6">No 402s issued this month yet.</td></tr>'
      : items
          .map(([item, row]) => {
            const conversion =
              row.challenges > 0
                ? `${Math.round((row.settled / row.challenges) * 100)}%`
                : ", ";
            const tiers = Object.entries(row.tiers)
              .map(([tier, count]) => `${tier}:${count}`)
              .join(" ");
            return `<tr><td>${escapeHtml(item)}</td>
              <td>${row.challenges}${row.challengesHouse ? ` <small>(+${row.challengesHouse}h)</small>` : ""}${row.challengesInfra ? ` <small>(+${row.challengesInfra}i)</small>` : ""}</td>
              <td>${row.settled}${row.settledHouse ? ` <small>(+${row.settledHouse}h)</small>` : ""}</td>
              <td>${conversion}</td>
              <td>${row.verifies}${row.verifiesHouse ? ` <small>(+${row.verifiesHouse}h)</small>` : ""}${row.verifiesInfra ? ` <small>(+${row.verifiesInfra}i)</small>` : ""}</td>
              <td>${escapeHtml(tiers || ", ")}</td></tr>`;
          })
          .join("\n");
  const payerLines =
    payers.length === 0
      ? "<li>No paying wallets on the books yet.</li>"
      : payers
          .slice(0, 15)
          .map(
            (payer) =>
              `<li><strong>[${payer.address.startsWith("0x") ? "base" : "sol"}]</strong> ${escapeHtml(payer.address)}, first seen ${escapeHtml(payer.first_seen.slice(0, 10))}, ${payer.purchases} purchase${payer.purchases === 1 ? "" : "s"}</li>`,
          )
          .join("\n");
  return `
    <table border="1" cellpadding="4">
      <tr><th>item</th><th>402s organic</th><th>settled organic</th><th>conversion</th><th>verifies</th><th>tiers</th></tr>
      ${rows}
    </table>
    <p>Organic numbers only in the main columns; house counts ride alongside as (+Nh), stored, never mixed. Conversion is organic-only. Channel-level funnel lives in Sources above.</p>
    <p>Paying wallets (${payers.length} on file, newest first):</p>
    <ul>${payerLines}</ul>`;
}

/**
 * WHAT THE COUNTER KEY MEANS, spelled as a path where it is one.
 *
 * The porch log buckets anything under /.well-known/ as the surface
 * "well-known" — no leading dot, because it is a bucket name and not a
 * URL. On this page that read as a path with a typo in it, and the
 * keeper did the reasonable thing: went to /well-known and got a 404.
 * It is the most-hit surface in the store (every x402 indexer and
 * scanner probes discovery on a loop), so it is also the label most
 * likely to be misread.
 *
 * The KEY is deliberately unchanged — renaming it would strand every
 * count already filed under the old name and split the history of the
 * busiest surface here. Only the display moves, which is the whole
 * difference between correcting a label and losing a month of data.
 */
const SURFACE_LABELS: Record<string, string> = {
  "well-known": "/.well-known/* (x402 + signing key; indexers live here)",
  treat: "/api/treat",
  bell: "/api/bell",
  "guestbook:read": "/api/guestbook (read)",
  "guestbook:write": "/api/guestbook (write)",
  storefront: "/ (the storefront)",
};

function surfaceLabel(surface: string): string {
  if (SURFACE_LABELS[surface]) {
    return SURFACE_LABELS[surface]!;
  }
  // item:<id> is a real path; so are the bare ones like /what and /stats.
  return surface.startsWith("item:")
    ? `/menu/${surface.slice(5)}`
    : `/${surface}`;
}

/**
 * The MCP client census. Sorted busiest first, because the question
 * this table exists to answer — is that traffic a handful of crawlers
 * on a loop, or a real spread of agents — is answered by the shape of
 * the top few rows.
 *
 * THE COPY HERE WAS CUT BACK ON THE KEEPER'S CALL, 2026-08-30, and
 * the reason is a rule rather than a preference. The first draft
 * opened by confessing that the door used to throw the client name
 * away and that a month of connections had been anonymous — true,
 * and rule 4: no preemptive denials, respond rather than announce. A
 * changelog entry was wearing a label's clothes. The history lives in
 * git and on the desk file, where history belongs.
 *
 * What survived is only what stops the number being misread: the
 * table counts FORWARD from its own deploy, so an empty one is not a
 * quiet door, and concurrent handshakes can lose an increment, so it
 * is a floor rather than a total.
 */
function mcpClientHtml(clients: Record<string, number> | undefined): string {
  const rows = Object.entries(clients ?? {}).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) {
    return `<p>Nothing counted yet. This table counts forward from when it shipped, so an empty one is not a quiet door.</p>`;
  }
  return `
    <table border="1" cellpadding="4">
      <tr><th>client</th><th>handshakes this month</th></tr>
      ${rows
        .map(
          ([name, count]) =>
            `<tr><td>${escapeHtml(name)}</td><td>${count}</td></tr>`,
        )
        .join("\n")}
    </table>`;
}

const KIND_MEANING: Record<PorchSurfaceKind, string> = {
  instrument: "free checks somebody actually ran",
  door: "interactive counters: something handed in, claimed, or read back",
  evidence: "the record itself: corpus, passports, registry, chip",
  storefront: "the shop's own pages and catalogs",
  room: "human pages past the storefront",
};

/** Organic visits summed by kind, busiest kind first. */
export function porchByKind(porch: PorchLedger): Array<[PorchSurfaceKind, number]> {
  const sums = new Map<PorchSurfaceKind, number>();
  for (const [surface, buckets] of Object.entries(porch.surfaces)) {
    const kind = porchSurfaceKind(surface);
    sums.set(kind, (sums.get(kind) ?? 0) + (buckets["organic"] ?? 0));
  }
  return [...sums.entries()].sort((a, b) => b[1] - a[1]);
}

function porchHtml(porch: PorchLedger): string {
  const surfaces = Object.entries(porch.surfaces);
  const byKind = porchByKind(porch);
  const kindLine =
    byKind.length === 0
      ? ""
      : `<p><strong>By kind, organic:</strong> ${byKind
          .map(
            ([kind, count]) =>
              `<strong>${count}</strong> ${escapeHtml(kind)} <small>(${escapeHtml(KIND_MEANING[kind])})</small>`,
          )
          .join(" \u00B7 ")}</p>`;
  const rows =
    surfaces.length === 0
      ? '<tr><td colspan="5">Nobody on the porch yet this month.</td></tr>'
      : surfaces
          .sort((a, b) => (b[1]["organic"] ?? 0) - (a[1]["organic"] ?? 0))
          .map(([surface, buckets]) => {
            const channels = Object.entries(buckets)
              .filter(([key]) => key.startsWith("organic:"))
              .map(([key, count]) => `${escapeHtml(key.slice(8))}: ${count}`)
              .join(" \u00B7 ");
            return `<tr><td>${escapeHtml(surfaceLabel(surface))}</td>
              <td>${escapeHtml(porchSurfaceKind(surface))}</td>
              <td>${buckets["organic"] ?? 0}${channels ? ` <small>(${channels})</small>` : ""}</td>
              <td>${buckets["house"] ?? 0}</td>
              <td>${buckets["infrastructure"] ?? 0}</td></tr>`;
          })
          .join("\n");
  return `
    ${kindLine}
    <table border="1" cellpadding="4">
      <tr><th>surface</th><th>kind</th><th>organic (by channel)</th><th>house</th><th>infrastructure</th></tr>
      ${rows}
    </table>
    <p><strong>Porch-to-purchase: ${porch.porchToPurchase === null ? ", " : porch.porchToPurchase}</strong>, organic 402s per organic porch visit. No cookies and no IP retention means no unique heads; this is the honest rate. Two things bias it upward and both are structural: porch writes are rate-capped under storm conditions (so the denominator is a floor) while 402s never sample, and a scanner that hits buy routes without browsing counts in the numerator only. Read it as a ceiling until the organic column is clean; <a href="/admin/recount">the recount</a> re-reads the raw rows with today's crawler table, and <a href="/admin/census">the census</a> asks the harder question underneath it: how many distinct clients ever presented a payment signature, against how many only ever read the price and left. When one of them is turned away, <a href="/admin/declines">the decline desk</a> says why — the rarest row in the books and the only one that measures intent rather than attention.</p>`;
}

/**
 * The shelf-by-shelf funnel: looks -> 402s -> settles. Sorted by looks,
 * because the question this table exists to answer is "what did they
 * pick up and put down," and the answer is at the top of that sort.
 */
function interestHtml(
  ledger: MonthLedger,
  porch: PorchLedger,
  almanacSlugs: readonly string[],
): string {
  const shopping = readWindowShopping(ledger, porch, almanacSlugs);
  const seen = shopping.rows.filter(
    (row) => (row.looks ?? 0) > 0 || row.looksInfra > 0 || row.challenges > 0,
  );
  const rows =
    seen.length === 0
      ? '<tr><td colspan="5">No item page has been opened yet this month.</td></tr>'
      : seen
          .sort(
            (a, b) =>
              (b.looks ?? -1) - (a.looks ?? -1) || b.looksInfra - a.looksInfra,
          )
          .map(
            (row) => `<tr><td><a href="/admin/events?item=${encodeURIComponent(row.item)}">${escapeHtml(row.item)}</a></td>
              <td>$${row.price_usdc}</td>
              <td>${row.looks === null ? '<span title="the page is the product; there is nothing to read for free">&mdash;</span>' : row.looks}${row.looksHouse > 0 ? ` <small>(+${row.looksHouse}h)</small>` : ""}</td>
              <td>${row.looksInfra}</td>
              <td>${row.challenges}</td>
              <td>${row.settled}</td></tr>`,
          )
          .join("\n");
  const putDown =
    shopping.lookedNeverTried.length === 0
      ? "<p>Nothing was read this month without somebody at least trying to pay for it.</p>"
      : `<p><strong>Read, never tried:</strong> ${shopping.lookedNeverTried
          .map((item) => escapeHtml(item))
          .join(", ")}. Most looked-at first.</p>`;
  const unopened =
    shopping.neverLookedAt.length === 0
      ? ""
      : `<p><strong>Nobody opened the page at all:</strong> ${shopping.neverLookedAt
          .map((item) => escapeHtml(item))
          .join(", ")}.</p>`;
  return `
    <table border="1" cellpadding="4">
      <tr><th>item</th><th>price</th><th>looks (organic)</th><th>infra</th><th>402s</th><th>settled</th></tr>
      ${rows}
    </table>
    ${putDown}
    ${unopened}
    <p><small>${escapeHtml(shopping.honestLimit)}</small></p>`;
}

/**
 * Recent PRICED events — every 402, settle and decline, each labelled
 * with which it was.
 *
 * It showed challenges only until 2026-07-30, and the keeper found what
 * that cost on the first organic settle: the Sources table put it under
 * "direct" while this table said "unknown", and the two looked like they
 * disagreed. Neither was wrong. A 402 and its settlement are TWO
 * DIFFERENT HTTP REQUESTS — the first carries no payment header, the
 * second carries the signature — and they can arrive with different
 * headers, so they can land in different channels. A bare fetch that
 * reads a price and then retries through a client library that sets a
 * user-agent is honestly "unknown" going in and "direct" coming through.
 *
 * Nothing here was miscounted. What was missing was the settle's OWN
 * row, so the nearest row got read as the purchase. A page that makes a
 * correct number look like a contradiction costs as much as a wrong one
 * and is harder to stop believing.
 */
function pricedEventsHtml(events: MetricEvent[]): string {
  if (events.length === 0) {
    return "<p>No priced events in the recent rows.</p>";
  }
  const rows = events
    .map((event) => {
      const bucket = event.house
        ? "house"
        : event.channel === "infrastructure"
          ? "infra"
          : "organic";
      const kind =
        event.kind === "settle"
          ? '<strong style="color:#1b6b2f">settled</strong>'
          : event.kind === "decline"
            ? '<strong style="color:#8c2f1b">declined</strong>'
            : "402";
      return `<tr><td>${escapeHtml(event.at.slice(5, 16))}</td>
        <td>${kind}</td>
        <td><a href="/admin/events?item=${encodeURIComponent(event.item)}">${escapeHtml(event.item)}</a></td>
        <td>${escapeHtml(event.channel)} <small>(${bucket})</small></td>
        <td><small>${escapeHtml((event.user_agent ?? "(no user-agent)").slice(0, 60))}</small></td>
        <td><small>${escapeHtml((event.referrer ?? "none").slice(0, 40))}</small></td></tr>`;
    })
    .join("\n");
  return `
    <table border="1" cellpadding="4">
      <tr><th>when (UTC)</th><th>what</th><th>item</th><th>channel</th><th>user-agent</th><th>referrer</th></tr>
      ${rows}
    </table>
    <p>Many items touched once with a generic UA = a scanner walking the catalog. One item hammered by the same UA with no settle = a budget-cap signal worth acting on.</p>
    <p><small><strong>A 402 and its settle are two different requests.</strong> They can carry different headers and therefore land in different channels, so a purchase can read "unknown" on the 402 row and count as "direct" in the Sources table above without either being wrong. Both rows are here now, so the comparison can be made properly instead of guessed at.</small></p>`;
}

function extensionStatus(payload: unknown): string {
  if (!isRecord(payload)) {
    return JSON.stringify(payload);
  }
  const status = typeof payload["status"] === "string" ? payload["status"] : "";
  const reason =
    typeof payload["rejectedReason"] === "string"
      ? payload["rejectedReason"]
      : typeof payload["reason"] === "string"
        ? payload["reason"]
        : "";
  if (status && reason) {
    return `${status} (${reason})`;
  }
  return status || reason || JSON.stringify(payload);
}

function bazaarHtml(entries: BazaarLedgerEntry[]): string {
  if (entries.length === 0) {
    return "<p>No EXTENSION-RESPONSES headers seen from the facilitator yet.</p>";
  }
  return entries
    .map((entry) => {
      const statuses = Object.entries(entry.extensions)
        .map(
          ([key, payload]) =>
            `${escapeHtml(key)}: ${escapeHtml(extensionStatus(payload))}`,
        )
        .join("; ");
      return `<li><strong>${escapeHtml(entry.path)}</strong> [${escapeHtml(entry.operation)}], ${statuses}, ${escapeHtml(entry.observed_at)}</li>`;
    })
    .join("\n");
}

function rackHtml(issues: GazetteIssue[]): string {
  if (issues.length === 0) {
    return "<p>No issues off the press yet.</p>";
  }
  return issues
    .map(
      (issue) =>
        `<li>Issue no. ${issue.issue_number}, ${escapeHtml(issue.title)}, ${escapeHtml(issue.date)}, contributors: ${issue.contributors.length > 0 ? issue.contributors.map((contributor) => escapeHtml(contributor.name)).join(", ") : "none named"}</li>`,
    )
    .join("\n");
}

export function renderOfficePage(data: OfficePageData): string {
  const work = data.work;
  const workTotal = work.orders + work.letters + work.reviews;
  const workStrip =
    workTotal + work.alerts === 0
      ? `<p>Nothing waiting at <a href="/admin/counter">the counter</a>. The alarms are quiet.</p>`
      : `<p><strong>Waiting at <a href="/admin/counter">the counter</a>:</strong>
         ${work.orders} open order${work.orders === 1 ? "" : "s"} \u00B7
         ${work.letters} letter${work.letters === 1 ? "" : "s"} \u00B7
         ${work.reviews} review${work.reviews === 1 ? "" : "s"} (tips/confessions/refunds)
         ${work.alerts > 0 ? `\u00B7 <strong style="color:#8c2f1b">${work.alerts} alarm${work.alerts === 1 ? "" : "s"}</strong>` : ""}</p>`;
  const body = `
  <section>
    <h2>The take — all-time</h2>
    ${
      data.take
        ? `${takeSectionHtml(data.take, data.allTime)}
           <p><small>Read ${data.takeReadAt ? escapeHtml(data.takeReadAt) : "on the last hourly round"} \u2014 this table
           comes from the hourly round rather than a walk this page
           paid for, which is why the desk opens now instead of
           counting every certificate first. A walk taken this second
           is at <a href="/admin/take">the take</a>.</small></p>`
        : `<p>The hourly round has not written the take yet, so there is nothing
           cached to show \u2014 nothing here is zero, nothing here has been
           counted. A walk taken this second is at <a href="/admin/take">the take</a>.</p>`
    }
    ${workStrip}
    ${moneyOutHtml(data.moneyOut)}
    ${visibilityHtml(data.visibility)}
  </section>

  <section>
    <h2>This month's slice, ${escapeHtml(data.monthLedger.month)}</h2>
    <p><small>A window, not the total. It resets when the calendar
    turns; when it looks smaller than the take above, that is the
    calendar, not a missing sale.</small></p>
    ${glanceHtml(data)}
  </section>

  <section>
    <h2>Sources, differentiated</h2>
    ${sourcesHtml(data.monthLedger, data.porchLedger)}
  </section>

  <section>
    <h2>The trend</h2>
    <p><small>Raw day counters, as written at the till. The
    reclassification ledger applies at the month line and the
    all-time figures, NOT here — a day that later moved organic →
    house (the 8/03 rail-testing runs, for instance) still shows its
    original booking in this table. That is the raw record doing its
    job, not a discrepancy.</small></p>
    ${trendHtml(data.monthLedger)}
  </section>

  <section>
    <h2>The ledger's answers, per item</h2>
    <p>402s issued vs settled per item, tier picks, wallets. The ledger outranks research.</p>
    ${ledgerAnswersHtml(data.monthLedger, data.payers)}
  </section>

  <section>
    <h2>Which shelf got picked up</h2>
    <p>Looks at an item's own page, against 402s and settles for that item.
    The looks column is the earliest signal this store can observe — it needs
    only curiosity, where a 402 needs a loaded wallet — and it is the only
    number here that says anything about want before money.</p>
    ${interestHtml(data.monthLedger, data.porchLedger, data.almanacSlugs)}
  </section>

  <section>
    <h2>Do the books agree with themselves</h2>
    ${
      /*
       * THREE STATES, NOT TWO — and the third is why this changed.
       * The line used to read `agree ? "they do" : "chase it"`, so the
       * day reconciliation stopped being computed on this page it
       * would have announced "something to chase" about books that
       * were perfectly fine: an alarm invented by a speed change.
       * A walk that has not run is not a walk that found something.
       */
      data.reconciliation === null
        ? `<p>Not checked here \u2014 the chain walk runs at <a href="/admin/reconciliation">the books check</a>, which is where its verdicts belong. This page no longer pays for one to print a sentence about it.</p>`
        : data.reconciliation.unexplained === 0
          ? `<p><strong style="color:#2f6b2f">They do.</strong> Full verdicts — counters, chain, deliveries, alarms — at <a href="/admin/reconciliation">the books check</a>.</p>`
          : `<p><strong>They differ by ${Math.abs(data.reconciliation.unexplained)}</strong> — a lost increment on a shared key, read as a floor, not an alarm (ruled 2026-09-04). The three witnesses and the arithmetic are at <a href="/admin/reconciliation">the books check</a>.</p>`
    }
  </section>

  <section>
    <details>
      <summary>The front porch, by surface</summary>
      <p>Free-tier visits by surface. Infrastructure is the noise floor made visible, never organic, never house.
      This table counts from its own deploy; <a href="/admin/bell">the bell, ring by ring</a> reads the raw rows and remembers further back.</p>
      ${porchHtml(data.porchLedger)}
    </details>
  </section>

  <section>
    <details>
      <summary>Who knocked at the MCP door</summary>
      <p>Clients name themselves in the MCP handshake. Counted forward
      from this table's own deploy; concurrent handshakes can lose one,
      so read it as a floor.</p>
      ${mcpClientHtml(data.mcpClients)}
    </details>
  </section>

  <section>
    <details>
      <summary>Priced events, up close (last ${data.recentChallenges.length}: 402s, settles and declines)</summary>
      ${pricedEventsHtml(data.recentChallenges)}
    </details>
  </section>

  <section>
    <details>
      <summary>Bazaar ledger (extension responses) and the Gazette rack (${data.gazetteIssues.length})</summary>
      <ul>${bazaarHtml(data.bazaarLedger)}</ul>
      <ul>${rackHtml(data.gazetteIssues)}</ul>
    </details>
  </section>`;
  return renderAdminShell("office", body, data.loadNotes);
}
