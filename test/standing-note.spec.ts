import { SELF, env } from "cloudflare:test";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  noteChallengeText,
  STANDING_NOTE_MAX_CHARS,
} from "@/services/standing-note";
import { takeCorpusSnapshot } from "@/services/corpus";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE STANDING-NOTE LANE (roadmap 3.6; G2 ruling §5, keeper-ruled
 * 2026-08-27): self-serve review and dispute, evidence-gated, no
 * keeper in the loop for the common case.
 *
 * Anyone who proves control of a wallet (EIP-191 personal_sign over a
 * statement-bound challenge) or of a host (serve the statement's
 * sha256 at /.well-known/scvd-note.txt) may attach a dated statement
 * that rides BESIDE the store's observation on every surface that
 * shows it — their words beside ours, NEVER replacing the
 * observation. A note about a subject the chain has never observed is
 * refused: a note rides an observation, and with no observation there
 * is nothing to stand beside (this is also the fence that keeps the
 * well-known fetch pointed only at doors our own probes already
 * visit).
 *
 * The wallet challenge is STATEMENT-BOUND and stateless, deliberately
 * unlike the claims door's single-use nonce: a payout can be stolen,
 * so its challenge must burn; a note is idempotent content, so
 * replaying its signature re-attaches the same words to the same
 * subject and nothing else. Binding the statement's hash into the
 * signed message is what makes that true.
 */

const WALLET_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SIGNER = privateKeyToAccount(WALLET_KEY);
const WALLET = SIGNER.address;

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: async () => new Response(new Uint8Array([1, 2, 3])),
};

function hostRow(
  host: string,
  payTo?: string[],
): Record<string, unknown> {
  return {
    host,
    url: `https://${host}/x402`,
    verdict: "ready",
    checked_at: "2026-08-27T10:00:00.000Z",
    failed: [],
    advisories: [],
    ...(payTo
      ? {
          offer: {
            networks: ["eip155:8453"],
            schemes: ["exact"],
            min_usdc: 0.01,
            pay_to: payTo.map((a) => (a.startsWith("0x") ? a.toLowerCase() : a)),
          },
        }
      : {}),
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function seedChain(): Promise<void> {
  const round = {
    week: "2026-W35",
    started_at: "2026-08-27T10:00:00.000Z",
    finished_at: "2026-08-27T10:30:00.000Z",
    listed_resources: 2,
    hosts: [
      hostRow("alpha.example", [WALLET]),
      hostRow("beta.example", [WALLET]),
    ],
  };
  await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round));
  const pass = await takeCorpusSnapshot(testEnv, okCalendar);
  expect(pass.taken).toBe(true);
}

beforeEach(async () => {
  for (const prefix of [KV_KEYS.corpusPrefix, "standing_note:"]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    for (const key of listed.keys) {
      await testEnv.COUNTERS.delete(key.name);
    }
  }
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
  await seedChain();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const STATEMENT =
  "This address is a platform checkout wallet serving multiple independent merchants.";

async function postNote(body: unknown): Promise<Response> {
  return SELF.fetch(`${BASE}/api/standing-note`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("the lane explains itself", () => {
  it("GET /api/standing-note serves the how-to, including the challenge shape", async () => {
    const response = await SELF.fetch(`${BASE}/api/standing-note`);
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).toMatch(/statement-sha256/);
    expect(raw).toMatch(/\.well-known\/scvd-note\.txt/);
    expect(raw).toMatch(/never replac/i);
  });
});

describe("host proof: the well-known file", () => {
  it("a host serving its statement's hash attaches a note that rides its page", async () => {
    const hash = await sha256Hex(STATEMENT);
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === "https://alpha.example/.well-known/scvd-note.txt") {
        return new Response(`${hash}\n`);
      }
      throw new Error(`Unexpected outbound fetch in tests: ${url}`);
    });
    const posted = await postNote({
      subject: "host",
      host: "alpha.example",
      statement: STATEMENT,
    });
    expect(posted.status).toBe(200);

    const page = await SELF.fetch(`${BASE}/corpus/host/alpha.example.json`);
    const body = (await page.json()) as {
      standing_note?: { statement?: string; evidence?: string };
      timeline?: unknown[];
    };
    expect(body.standing_note?.statement).toBe(STATEMENT);
    expect(body.standing_note?.evidence).toBe("well_known");
    // BESIDE, never instead: the observation surface is intact.
    expect(Array.isArray(body.timeline)).toBe(true);
  });

  it("a well-known file that does not carry the hash refuses, naming what was expected", async () => {
    vi.stubGlobal("fetch", async () => new Response("something else"));
    const posted = await postNote({
      subject: "host",
      host: "alpha.example",
      statement: STATEMENT,
    });
    expect(posted.status).toBe(403);
    const body = (await posted.json()) as { error?: string };
    expect(String(body.error)).toMatch(/sha256|hash/i);
  });

  it("a host the chain never observed is refused — a note rides an observation", async () => {
    const posted = await postNote({
      subject: "host",
      host: "never-met.example",
      statement: STATEMENT,
    });
    expect(posted.status).toBe(404);
    const body = (await posted.json()) as { error?: string };
    expect(String(body.error)).toMatch(/observ/i);
  });
});

describe("wallet proof: statement-bound personal_sign", () => {
  it("a valid signature attaches the note to the wallet, and it rides EVERY door advertising it", async () => {
    const challenge = noteChallengeText(WALLET, await sha256Hex(STATEMENT));
    const signature = await SIGNER.signMessage({ message: challenge });
    const posted = await postNote({
      subject: "wallet",
      address: WALLET,
      statement: STATEMENT,
      signature,
    });
    expect(posted.status).toBe(200);

    for (const host of ["alpha.example", "beta.example"]) {
      const page = await SELF.fetch(`${BASE}/corpus/host/${host}.json`);
      const body = (await page.json()) as {
        payment_address?: {
          standing_note?: { statement?: string; evidence?: string };
          also_receives_at_other_doors?: number;
        };
      };
      expect(body.payment_address?.standing_note?.statement).toBe(STATEMENT);
      expect(body.payment_address?.standing_note?.evidence).toBe(
        "wallet_signature",
      );
      // The fact the note stands beside is still stated.
      expect(body.payment_address?.also_receives_at_other_doors).toBe(1);
    }
  });

  it("a signature from a different key recovers elsewhere and is refused", async () => {
    const stranger = privateKeyToAccount(
      "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    );
    const challenge = noteChallengeText(WALLET, await sha256Hex(STATEMENT));
    const signature = await stranger.signMessage({ message: challenge });
    const posted = await postNote({
      subject: "wallet",
      address: WALLET,
      statement: STATEMENT,
      signature,
    });
    expect(posted.status).toBe(403);
  });

  it("a wallet the chain never saw advertised is refused", async () => {
    const stranger = privateKeyToAccount(
      "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    );
    const challenge = noteChallengeText(
      stranger.address,
      await sha256Hex(STATEMENT),
    );
    const signature = await stranger.signMessage({ message: challenge });
    const posted = await postNote({
      subject: "wallet",
      address: stranger.address,
      statement: STATEMENT,
      signature,
    });
    expect(posted.status).toBe(404);
  });
});

describe("the statement is bounded and plain", () => {
  it("over the cap refuses, naming the cap", async () => {
    const posted = await postNote({
      subject: "host",
      host: "alpha.example",
      statement: "x".repeat(STANDING_NOTE_MAX_CHARS + 1),
    });
    expect(posted.status).toBe(400);
    const body = (await posted.json()) as { error?: string };
    expect(String(body.error)).toContain(String(STANDING_NOTE_MAX_CHARS));
  });

  it("a malformed host name never reaches the network", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("must not fetch");
    });
    const posted = await postNote({
      subject: "host",
      host: "not a hostname!",
      statement: STATEMENT,
    });
    expect(posted.status).toBe(400);
  });
});
