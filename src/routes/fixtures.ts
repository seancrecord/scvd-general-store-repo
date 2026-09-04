import { Hono } from "hono";
import { CORRECTIONS_POINTER } from "@/store/corrections";
import door_accepts_empty from "../../test/fixtures/doors/accepts-empty.json";
import door_accepts_missing_asset from "../../test/fixtures/doors/accepts-missing-asset.json";
import door_answers_200 from "../../test/fixtures/doors/answers-200.json";
import door_body_offers from "../../test/fixtures/doors/body-offers.json";
import door_clean_402 from "../../test/fixtures/doors/clean-402.json";
import door_header_absent from "../../test/fixtures/doors/header-absent.json";
import door_header_unparseable from "../../test/fixtures/doors/header-unparseable.json";
import door_two_surfaces from "../../test/fixtures/doors/two-surfaces.json";
import door_wrong_version from "../../test/fixtures/doors/wrong-version.json";
import mpp_bad_amount_unknown_method from "../../test/fixtures/mpp/bad-amount-unknown-method.json";
import mpp_basic_beside_x402 from "../../test/fixtures/mpp/basic-beside-x402.json";
import mpp_comma_in_description from "../../test/fixtures/mpp/comma-in-description.json";
import mpp_evm_clean from "../../test/fixtures/mpp/evm-clean.json";
import mpp_expired_and_http from "../../test/fixtures/mpp/expired-and-http.json";
import mpp_id_missing_realm_missing from "../../test/fixtures/mpp/id-missing-realm-missing.json";
import mpp_request_not_canonical from "../../test/fixtures/mpp/request-not-canonical.json";
import mpp_session_intent_unregistered from "../../test/fixtures/mpp/session-intent-unregistered.json";
import mpp_stripe_card from "../../test/fixtures/mpp/stripe-card.json";
import mpp_tempo_default_testnet from "../../test/fixtures/mpp/tempo-default-testnet.json";
import mpp_tempo_mainnet from "../../test/fixtures/mpp/tempo-mainnet.json";
import mpp_two_challenges from "../../test/fixtures/mpp/two-challenges.json";
import mpp_x402_and_mpp from "../../test/fixtures/mpp/x402-and-mpp.json";
import verifier_issuer_key_document from "../../verifier/fixtures/issuer-key-document.json";
import verifier_offer_expired_but_wellformed from "../../verifier/fixtures/offer-expired-but-wellformed.json";
import verifier_offer_tampered_payload from "../../verifier/fixtures/offer-tampered-payload.json";
import verifier_offer_valid from "../../verifier/fixtures/offer-valid.json";
import verifier_receipt_missing_payer from "../../verifier/fixtures/receipt-missing-payer.json";
import verifier_receipt_valid from "../../verifier/fixtures/receipt-valid.json";
import verifier_receipt_wrong_key from "../../verifier/fixtures/receipt-wrong-key.json";
import { citeBlock } from "@/lib/cite";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";
import type { HonoEnv } from "@/types";

/**
 * THE FIXTURES, SERVED (roadmap C7, 2026-09-04). The recorded doors,
 * the MPP challenges and the verifier's vectors this store tests
 * itself against, at stable public URLs, so another instrument, a
 * paper or an agent can cite the exact bytes rather than a description
 * of them. Each set is the directory in the tree; the index names every
 * file with the sha256 of the bytes served, and test/fixtures-served
 * .spec.ts holds this list to the directories, so a fixture added to
 * the tree without a URL fails the build.
 *
 * Bytes: each file is served as its JSON re-serialised with two-space
 * indentation and a trailing newline, which is how every file in these
 * directories is stored, and the sha256 in the index is over exactly
 * the bytes a GET returns. Unsigned recorded material, and the cite
 * line says so.
 */
export const fixturesRoutes = new Hono<HonoEnv>();

export interface FixtureSet {
  set: string;
  directory: string;
  what: string;
  entries: { name: string; body: Record<string, unknown> }[];
}

export const FIXTURE_SETS: readonly FixtureSet[] = [
  {
    set: "doors",
    directory: "test/fixtures/doors",
    what: "Recorded x402 402 responses (status, headers, body), each naming the battery checks it fails and no others: the release gate for a battery version.",
    entries: [
      { name: "accepts-empty", body: door_accepts_empty as Record<string, unknown> },
      { name: "accepts-missing-asset", body: door_accepts_missing_asset as Record<string, unknown> },
      { name: "answers-200", body: door_answers_200 as Record<string, unknown> },
      { name: "body-offers", body: door_body_offers as Record<string, unknown> },
      { name: "clean-402", body: door_clean_402 as Record<string, unknown> },
      { name: "header-absent", body: door_header_absent as Record<string, unknown> },
      { name: "header-unparseable", body: door_header_unparseable as Record<string, unknown> },
      { name: "two-surfaces", body: door_two_surfaces as Record<string, unknown> },
      { name: "wrong-version", body: door_wrong_version as Record<string, unknown> }
    ],
  },
  {
    set: "mpp",
    directory: "test/fixtures/mpp",
    what: "Recorded and synthetic Machine Payments Protocol 402s (WWW-Authenticate: Payment), each naming the MPP battery checks it fails and the advisories it raises.",
    entries: [
      { name: "bad-amount-unknown-method", body: mpp_bad_amount_unknown_method as Record<string, unknown> },
      { name: "basic-beside-x402", body: mpp_basic_beside_x402 as Record<string, unknown> },
      { name: "comma-in-description", body: mpp_comma_in_description as Record<string, unknown> },
      { name: "evm-clean", body: mpp_evm_clean as Record<string, unknown> },
      { name: "expired-and-http", body: mpp_expired_and_http as Record<string, unknown> },
      { name: "id-missing-realm-missing", body: mpp_id_missing_realm_missing as Record<string, unknown> },
      { name: "request-not-canonical", body: mpp_request_not_canonical as Record<string, unknown> },
      { name: "session-intent-unregistered", body: mpp_session_intent_unregistered as Record<string, unknown> },
      { name: "stripe-card", body: mpp_stripe_card as Record<string, unknown> },
      { name: "tempo-default-testnet", body: mpp_tempo_default_testnet as Record<string, unknown> },
      { name: "tempo-mainnet", body: mpp_tempo_mainnet as Record<string, unknown> },
      { name: "two-challenges", body: mpp_two_challenges as Record<string, unknown> },
      { name: "x402-and-mpp", body: mpp_x402_and_mpp as Record<string, unknown> }
    ],
  },
  {
    set: "verifier",
    directory: "verifier/fixtures",
    what: "The x402-verify package's vectors: signed receipts and offers, valid and deliberately broken, with the key document they verify against.",
    entries: [
      { name: "issuer-key-document", body: verifier_issuer_key_document as Record<string, unknown> },
      { name: "offer-expired-but-wellformed", body: verifier_offer_expired_but_wellformed as Record<string, unknown> },
      { name: "offer-tampered-payload", body: verifier_offer_tampered_payload as Record<string, unknown> },
      { name: "offer-valid", body: verifier_offer_valid as Record<string, unknown> },
      { name: "receipt-missing-payer", body: verifier_receipt_missing_payer as Record<string, unknown> },
      { name: "receipt-valid", body: verifier_receipt_valid as Record<string, unknown> },
      { name: "receipt-wrong-key", body: verifier_receipt_wrong_key as Record<string, unknown> }
    ],
  },
];

export function fixtureBytes(body: Record<string, unknown>): string {
  return `${JSON.stringify(body, null, 2)}\n`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fixturesIndex(base: string): Promise<Record<string, unknown>> {
  const sets = await Promise.all(
    FIXTURE_SETS.map(async (set) => ({
      set: set.set,
      directory: set.directory,
      what: set.what,
      entries: await Promise.all(
        set.entries.map(async (entry) => ({
          name: entry.name,
          url: `${base}/fixtures/${set.set}/${entry.name}.json`,
          sha256: await sha256Hex(fixtureBytes(entry.body)),
          ...(typeof entry.body["why"] === "string" ? { why: entry.body["why"] } : {}),
          ...(typeof entry.body["recorded"] === "string" ? { recorded: entry.body["recorded"] } : {}),
        })),
      ),
    })),
  );
  const count = sets.reduce((n, set) => n + set.entries.length, 0);
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "The fixtures: recorded doors, challenges and vectors",
    description: "The recorded 402 doors, MPP challenges and signed-artifact vectors this store tests its own instruments against, served at stable URLs so another instrument can cite the exact bytes.",
    url: `${base}/fixtures.json`,
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    measurementTechnique: "Each file is the bytes a door served (or, where marked synthetic, bytes built from a specification's own examples), kept verbatim and named for the checks it fails; nothing is a live probe.",
    conditionsOfAccess: "Free, no account, no rate limit beyond the edge's. Cite the URL and the sha256 beside it.",
    variableMeasured: [
      { "@type": "PropertyValue", name: "the set a fixture belongs to and the tree directory it is read from", propertyID: "sets[].set, sets[].directory" },
      { "@type": "PropertyValue", name: "the stable URL whose bytes are the fixture", propertyID: "sets[].entries[].url" },
      { "@type": "PropertyValue", name: "the sha256 of exactly the bytes that URL returns", propertyID: "sets[].entries[].sha256" },
      { "@type": "PropertyValue", name: "what the fixture demonstrates and where its bytes came from", propertyID: "sets[].entries[].why, sets[].entries[].recorded" },
    ],
    how_to_read: "Pick a set, fetch an entry's URL, hash the bytes you received and compare to sha256; then run your own instrument over the fixture and compare your findings to the checks it names. A fixture is a test corpus, not a finding about any live door.",
    what_this_is_not: `${NEVER_A_RANKING_SENTENCE} These are not observations of live doors and not signed: a recorded fixture is material to test a client or an instrument against, kept verbatim, and a synthetic one is built from a specification's own examples and says so. Nothing here names a live operator.`,
    fixture_count: count,
    sets,
    corrections: CORRECTIONS_POINTER,
    ...citeBlock({ base, what: "fixture index", which: `(${count} fixtures in ${sets.length} sets)`, observed_at: null, url: `${base}/fixtures.json`, signed: false }),
  };
}

fixturesRoutes.get("/fixtures.json", async (c) => c.json(await fixturesIndex(c.env.STORE_BASE_URL), 200, { "Cache-Control": "public, max-age=3600" }));

fixturesRoutes.get("/fixtures/:set{[a-z]+}/:file{[a-z0-9-]+\\.json}", (c) => {
  const set = FIXTURE_SETS.find((candidate) => candidate.set === c.req.param("set"));
  const name = c.req.param("file").replace(/\.json$/, "");
  const entry = set?.entries.find((candidate) => candidate.name === name);
  if (!set || !entry) {
    return c.json({ error: `No fixture ${c.req.param("set")}/${name}. The index is at ${c.env.STORE_BASE_URL}/fixtures.json.` }, 404);
  }
  return c.body(fixtureBytes(entry.body), 200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-Fixture-Cite": `scvd.store fixture ${set.set}/${name}; unsigned recorded material; bytes at ${c.env.STORE_BASE_URL}/fixtures/${set.set}/${name}.json` });
});
