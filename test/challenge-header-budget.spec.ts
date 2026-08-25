import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";

/**
 * Node's documented default `http.maxHeaderSize`. Undici — and so the
 * global `fetch` in every stock Node agent runtime — rejects a response
 * whose header block exceeds it with UND_ERR_HEADERS_OVERFLOW. The
 * request never reaches user code; the buyer sees a transport error,
 * not a 402.
 */
const NODE_MAX_HEADER_SIZE = 16_384;

/**
 * The line we hold, deliberately below the cliff. A door that clears
 * the real limit by forty bytes is one added rail, one added tier or
 * one added extension away from being unbuyable, and the failure mode
 * is invisible from our side: the challenge leaves here looking fine.
 */
const HEADER_BUDGET = 15_360;

/**
 * The widest shelf this store can quote: three rails (Base, Polygon,
 * Solana) times three patronage tiers. Production issues nine signed
 * offers for such an item.
 */
const WIDEST_ACCEPTS = 9;

/**
 * WHY THIS FILE PROJECTS INSTEAD OF ONLY MEASURING, and it is the
 * whole reason it works.
 *
 * The first draft walked every door and asserted the totals. It passed
 * with the defect still in, because this test worker has fewer rails
 * configured than production: the same item that ships 16,730 bytes
 * live measured 9,592 here, since three offers were signed where
 * production signs nine. A guard that cannot reach the failing size is
 * not a guard, it is a green light with no bulb behind it — and this
 * store spends its days finding exactly that shape in other people's
 * endpoints.
 *
 * So the invariant under test is the ENVELOPE, which is identical in
 * every environment. That number does not move when a test binding is
 * missing.
 *
 * Budget: a conformant jws offer measures 577B today. 650 leaves room
 * for a longer resource path or a wider amount without leaving room
 * for a whole extra field — the forbidden `payload` alone costs 287B.
 */
const OFFER_ENVELOPE_BUDGET = 650;

/** What Node counts: the status line, every header line, the blank line. */
function headerBytes(response: Response): number {
  let total = `HTTP/1.1 ${response.status} ${response.statusText}\r\n`.length;
  response.headers.forEach((value, name) => {
    total += `${name}: ${value}\r\n`.length;
  });
  return total + 2;
}

/**
 * THE CATALOGUE, NOT A SAMPLE — and that distinction is the whole
 * reason this file exists.
 *
 * Two items shipped over Node's limit and nobody noticed for weeks,
 * because every check anyone ran used curl or a research harness,
 * neither of which enforces a header cap. Six deep research reports
 * and three syntheses examined this store's 402 path without finding
 * it; the reproduction took one `fetch` from a stock Node runtime.
 * A sampled check would have picked `hello` at 7.3KB and passed.
 */
describe("every priced door fits through a stock Node client", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("keeps one signed offer under its envelope budget", async () => {
    /*
     * A PER-OFFER BUDGET, AND IT TOOK THREE ATTEMPTS TO GET HERE.
     *
     * Draft one asserted each door's total header bytes. It passed with
     * the defect still in, because this worker configures fewer rails
     * than production: the item that ships 16,730B live measured 9,592B
     * here, two offers signed where production signs nine.
     *
     * Draft two projected the total — this door's non-offer remainder
     * plus nine offers. It ALSO passed with the defect in, because the
     * remainder is environmental too: 3,278B here against roughly
     * 6,300B live. A projection built on a number that moves between
     * environments predicts the wrong environment.
     *
     * What does not move is the envelope. One offer is one offer
     * everywhere, and nine of them are what fills the header on the
     * widest shelf. So the budget lives here, on the only quantity this
     * test can see truly — and it is the quantity that broke: the
     * forbidden `payload` field took an offer from 577B to 864B, and
     * nine of those is the difference between a door a stock Node
     * client can open and one it refuses outright.
     *
     * Two drafts that went green against a live defect is the same
     * shape this store charges other people to find. Writing the third
     * was cheaper than publishing the second.
     */
    const response = await SELF.fetch(`${BASE}/api/buy/hello`);
    expect(response.status).toBe(402);
    const body = (await response.json()) as Record<string, unknown>;
    const offers = (
      ((body["extensions"] as Record<string, unknown>)["offer-receipt"]) as unknown as {
        info: { offers: Record<string, unknown>[] };
      }
    ).info.offers;
    expect(offers.length, "no offers to measure").toBeGreaterThan(0);

    const perOffer = Math.max(
      ...offers.map((offer) => JSON.stringify(offer).length),
    );
    expect(
      perOffer,
      `one offer is ${perOffer}B; ${WIDEST_ACCEPTS} of them ride every challenge on the widest shelf, base64-expanded by a third, and a stock Node client refuses the response at ${NODE_MAX_HEADER_SIZE}B`,
    ).toBeLessThan(OFFER_ENVELOPE_BUDGET);
  });

  it("measures the live catalogue too, for what this worker can see", async () => {
    /*
     * Weaker than the projection above and kept anyway: it catches
     * anything that bloats a challenge OUTSIDE the offer envelopes,
     * which the projection holds constant. Its limitation is stated
     * rather than discovered — this worker configures fewer rails than
     * production, so the totals here run several kilobytes light.
     */
    const discovery = (await (
      await SELF.fetch(`${BASE}/.well-known/x402`)
    ).json()) as { resources: string[] };
    expect(discovery.resources.length).toBeGreaterThan(5);

    // Serially: firing every door at once made them answer 500, and a
    // 500 has small headers, so the check went green having measured
    // nothing.
    const measured: { path: string; status: number; bytes: number }[] = [];
    for (const resource of discovery.resources) {
      const path = new URL(resource).pathname;
      const response = await SELF.fetch(`${BASE}${path}`);
      measured.push({ path, status: response.status, bytes: headerBytes(response) });
    }

    const challenges = measured.filter((row) => row.status === 402);
    expect(
      challenges.length,
      `only ${challenges.length} of ${measured.length} doors answered 402; this check measured almost nothing`,
    ).toBeGreaterThanOrEqual(Math.ceil(measured.length * 0.6));

    const overCliff = challenges.filter(
      (row) => row.bytes >= NODE_MAX_HEADER_SIZE,
    );
    expect(
      overCliff.map((row) => `${row.path}=${row.bytes}B`),
      "these doors are unbuyable from a stock Node client",
    ).toEqual([]);
  });
});
