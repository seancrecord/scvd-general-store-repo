import { Hono } from "hono";
import type { HonoEnv } from "@/types";

/**
 * THE OBSTACLE COURSE — /api/practice/{scenario} (P5 of the ROI
 * order, outside-reads log item 5's free half): doors that fail in
 * DELIBERATE, NAMED, DETERMINISTIC ways, so an agent can rehearse
 * the failure modes the August field run proved real *against a live
 * counterparty* without risking a cent at a stranger's door.
 *
 * Every scenario body says what is wrong, what a good client does,
 * and which named preflight check catches it — the course and the
 * battery teach the same curriculum. Nothing here mints, nothing
 * here books into the market metrics, and the one payable-shaped
 * door pays dust to a dead address and says so three times.
 *
 * THE PAID HALF of log item 5 already exists and is deliberately NOT
 * duplicated: a signed report on why an agent cannot buy from a door
 * is service_audit — the same battery, signed, run against YOUR
 * endpoint. A second SKU for a subset job is the exact mistake the
 * 27-to-5 tool consolidation exists to forbid; the course's index
 * says where the signed version lives instead.
 */
export const practiceRoutes = new Hono<HonoEnv>();

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
/** The classic burn address: payable-shaped, recoverable by nobody. */
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";

interface Scenario {
  id: string;
  what_is_wrong: string;
  what_a_good_client_does: string;
  preflight_names_this: string;
  header: string | null;
  /** A challenge carried in the 402 BODY as well, for the two-surface lesson. */
  body_challenge?: Record<string, unknown>;
  /** An MPP challenge on WWW-Authenticate, for the second-wire lesson (V3 PR 1). */
  mpp_challenge?: string;
}

function b64(challenge: unknown): string {
  return btoa(JSON.stringify(challenge));
}

function accepts(entry: Record<string, unknown>): string {
  return b64({ x402Version: 2, accepts: [entry] });
}

function scenarios(base: string): Scenario[] {
  return [
    {
      id: "malformed-header",
      what_is_wrong:
        "The PAYMENT-REQUIRED header is not base64 JSON — it cannot be parsed at all.",
      what_a_good_client_does:
        "Treats the endpoint as broken and moves on; never guesses terms it could not read, never retries with money.",
      preflight_names_this: "challenge-parses",
      header: "!!this-is-not-base64-json!!",
    },
    {
      id: "empty-accepts",
      what_is_wrong:
        "The challenge parses but offers zero ways to pay: accepts is an empty list.",
      what_a_good_client_does:
        "Reports 'no payable offer' distinctly from 'could not parse' — they are different seller defects.",
      preflight_names_this: "accepts-non-empty",
      header: b64({ x402Version: 2, accepts: [] }),
    },
    {
      id: "testnet-network",
      what_is_wrong:
        "The offer quotes a TESTNET network (eip155:84532, Base Sepolia). A mainnet wallet signs this and the payment settles nowhere real — the classic silent trap.",
      what_a_good_client_does:
        "Checks the network id against the mainnets it actually holds funds on BEFORE signing anything.",
      preflight_names_this: "network-is-mainnet",
      header: accepts({
        scheme: "exact",
        network: "eip155:84532",
        asset: USDC_BASE,
        amount: "1000",
        payTo: DEAD_ADDRESS,
        resource: `${base}/api/practice/testnet-network`,
      }),
    },
    {
      id: "name-payto",
      what_is_wrong:
        "payTo is an ENS name, not an address. Payment signs over BYTES; a name is an unresolved lookup step the payment protocol does not perform.",
      what_a_good_client_does:
        "Refuses to sign until payTo is a concrete address on the offer's own chain — and never resolves the name itself and pays the result, because then the signature binds to whatever the resolver said that second.",
      preflight_names_this: "payto-is-a-name",
      header: accepts({
        scheme: "exact",
        network: "eip155:8453",
        asset: USDC_BASE,
        amount: "1000",
        payTo: "practice-door.eth",
        resource: `${base}/api/practice/name-payto`,
      }),
    },
    {
      id: "wrong-rail-payto",
      what_is_wrong:
        "A base58 Solana address sits in an eip155 (EVM) offer's payTo. No resolver saves this: the rails' address spaces do not intersect.",
      what_a_good_client_does:
        "Validates that payTo's shape matches the offer's network family before signing.",
      preflight_names_this: "payto-wrong-rail",
      header: accepts({
        scheme: "exact",
        network: "eip155:8453",
        asset: USDC_BASE,
        amount: "1000",
        payTo: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        resource: `${base}/api/practice/wrong-rail-payto`,
      }),
    },
    {
      id: "two-surfaces",
      what_is_wrong:
        "The PAYMENT-REQUIRED header and the 402 body both carry a challenge, and they disagree: the header asks 1000 atomic units, the body asks 2000 for the same rail and payTo. Two prices for one knock, served in one response.",
      what_a_good_client_does:
        "Signs against the header, which the spec makes the canonical placement, and treats a body that disagrees with it as a defect worth reporting rather than a second offer — never picks the cheaper of two surfaces as though the door had offered a choice.",
      preflight_names_this: "placement-mismatch",
      header: accepts({
        scheme: "exact",
        network: "eip155:8453",
        asset: USDC_BASE,
        amount: "1000",
        payTo: DEAD_ADDRESS,
        resource: `${base}/api/practice/two-surfaces`,
      }),
      body_challenge: {
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            asset: USDC_BASE,
            amount: "2000",
            payTo: DEAD_ADDRESS,
            resource: `${base}/api/practice/two-surfaces`,
          },
        ],
      },
    },
    {
      id: "mpp-shape",
      what_is_wrong:
        "NOTHING, on the other wire: this door speaks the Machine Payments Protocol, not x402. The 402 carries WWW-Authenticate: Payment and no PAYMENT-REQUIRED header, so the x402 battery reads not_ready — which is a fact about which wire the door speaks, never a defect. No payment path stands behind it (the door opened 2026-09-04): the challenge is a shape to read, not an offer to pay.",
      what_a_good_client_does:
        "Reads protocols_spoken before reading the verdict. An x402 client cannot pay this door and should say so plainly (no PAYMENT-REQUIRED), never report it as broken; an MPP client reads the Payment challenge's id, method, intent and request and decides from those.",
      preflight_names_this:
        "(x402 battery: not_ready on payment-required-header; MPP battery: every check passes, protocols_spoken is [\"mpp\"] — read the mpp block)",
      header: null,
      mpp_challenge: `Payment id="prac_mpp_shape_0001", realm="scvd.store", method="evm", intent="charge", request="${btoa(JSON.stringify({ amount: "1000", currency: USDC_BASE, methodDetails: { chainId: 8453, credentialTypes: ["authorization"] }, recipient: DEAD_ADDRESS })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}", description="practice door: read the shape, do not pay"`,
    },
    {
      id: "dust-correct",
      what_is_wrong:
        "NOTHING — this offer is well-formed, and that is the lesson: your parser should accept it. But paying it burns 0.000001 USDC to the dead address, so a good client also notices the payTo is 0x…dEaD. PRACTICE DOOR: DO NOT PAY IT.",
      what_a_good_client_does:
        "Parses it cleanly, then applies judgment beyond conformance: a syntactically perfect offer can still be a bad trade.",
      preflight_names_this:
        "(passes the battery — conformance is necessary, never sufficient)",
      header: accepts({
        scheme: "exact",
        network: "eip155:8453",
        asset: USDC_BASE,
        amount: "1",
        payTo: DEAD_ADDRESS,
        resource: `${base}/api/practice/dust-correct`,
      }),
    },
  ];
}

practiceRoutes.get("/api/practice", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    what:
      "The obstacle course: doors that fail in deliberate, named, deterministic ways, so your agent rehearses real x402 failure modes against a live counterparty without risking money at a stranger's door. Free, forever, never counted in anyone's metrics.",
    how: `GET ${base}/api/practice/{scenario}. Each answers 402 (or a broken imitation of one) and the body explains itself: what is wrong, what a good client does, and which named check in the free battery (POST ${base}/api/preflight) catches it.`,
    scenarios: scenarios(base).map((scenario) => ({
      id: scenario.id,
      url: `${base}/api/practice/${scenario.id}`,
      teaches: scenario.what_is_wrong,
    })),
    nothing_here_mints:
      "No practice door sells anything. The one payable-shaped offer (dust-correct) pays dust to the dead address and says so — do not pay it.",
    when_it_is_your_door:
      `When the broken door is YOUR OWN: the free preflight names the defect (POST ${base}/api/preflight), and the SIGNED version of that diagnosis — same battery, published criteria, a report you can hand to whoever runs your infrastructure — is the service_audit item on the shelf. One battery, three uses: rehearse here, self-check free, buy the signed record when you need it on paper.`,
  });
});

practiceRoutes.get("/api/practice/:scenario", (c) => {
  const base = c.env.STORE_BASE_URL;
  const found = scenarios(base).find(
    (scenario) => scenario.id === c.req.param("scenario"),
  );
  if (!found) {
    return c.json(
      {
        error: "No such practice scenario.",
        scenarios: scenarios(base).map((scenario) => scenario.id),
      },
      404,
    );
  }
  const body = {
    ...(found.body_challenge ?? {}),
    practice: true,
    scenario: found.id,
    what_is_wrong: found.what_is_wrong,
    what_a_good_client_does: found.what_a_good_client_does,
    preflight_names_this: found.preflight_names_this,
    the_course: `${base}/api/practice`,
  };
  if (found.mpp_challenge) {
    // Problem Details, as the MPP draft serves its 402 body.
    return c.json(
      { type: "https://paymentauth.org/problems/payment-required", title: "Payment Required", status: 402, ...body },
      402,
      { "Content-Type": "application/problem+json", "WWW-Authenticate": found.mpp_challenge },
    );
  }
  return c.json(body, 402, {
    ...(found.header ? { "PAYMENT-REQUIRED": found.header } : {}),
  });
});
