import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { findDefaultAsset as findEvmDefaultAsset } from "@x402/evm";
import { buildRoutesConfig } from "@/lib/payments";
import schemaSource from "../node_modules/@x402/core/dist/cjs/server/index.js?raw";
import { STORE_SERVICE_NAME, STORE_TAGS } from "@/store/metadata";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * TWO CEILINGS WE ARE SITTING ON, NEITHER OF WHICH RINGS (#92,
 * 2026-08-28). Both are the shape this store spent August naming: a
 * limit enforced somewhere we cannot watch, whose breach reaches our
 * books as absence rather than as an error.
 *
 * THE FIRST IS `tags`, AND THERE IS PRECEDENT IN THIS FILE'S OWN
 * HISTORY. `ResourceInfoSchema` caps tags at five, each 32 printable
 * ASCII characters, and serviceName at 32. That schema is embedded in
 * `PaymentPayloadV2Schema` — the payload the BUYER echoes to the
 * FACILITATOR — which is exactly the path that made four doors
 * unbuyable once before, when their descriptions outgrew CDP's
 * 500-character limit. `ROUTE_DESCRIPTION_CAP` exists in
 * lib/payments.ts because of that day.
 *
 * `STORE_TAGS` holds five. Not four. A sixth is a one-line edit in a
 * file about copy, it typechecks, the door still answers 402 with a
 * valid PAYMENT-REQUIRED header — observed, not assumed — and the
 * break lands at verify time on somebody else's machine, after the
 * buyer has signed. Nothing in this repository would have said a word.
 *
 * THE SECOND IS THE DEFAULT-ASSET ALLOWLIST, and the filed finding
 * turned out to be wrong about our exposure to it. The mechanism is
 * real; our reachability of it is not. The correction, and the guard
 * that replaced the one this file set out to write, are in the second
 * describe block below.
 *
 * THE CAPS ARE READ OUT OF THE INSTALLED PACKAGE, never retyped, for
 * the same reason `client-spend-cap.ts` imports its ceiling: a guard
 * holding its own copy of somebody else's number is a guard that
 * agrees with the author of the guard. These are not exported, so the
 * schema source is read and the numbers parsed out of it — and if that
 * parse ever fails, the test FAILS rather than skipping, because a
 * ceiling we can no longer read is exactly when we most need to look
 * (rule 52).
 */

/**
 * The schema arrives as TEXT, not through `node:fs`: this suite runs
 * in workerd, where there is no filesystem. `?raw` is the same
 * mechanism test/verifier-package.spec.ts already uses to read a
 * published artifact rather than a regenerated one — and it has the
 * better property anyway, since the bytes are pinned into the test
 * bundle at build time.
 */
const SCHEMA_SOURCE = "@x402/core/dist/cjs/server/index.js";

interface ResourceInfoCaps {
  tags: number;
  tagLength: number;
  serviceName: number;
}

/**
 * The three numbers, parsed out of the schema that enforces them.
 * Deliberately strict: a pattern that stops matching means the
 * package changed shape, and the honest response to that is a red
 * test naming the file, not a quiet pass on a stale constant.
 */
function readResourceInfoCaps(): ResourceInfoCaps {
  const source = schemaSource;
  const tags = source.match(/tags:[\s\S]{0,200}?\)\)\.max\((\d+)\)/);
  const tagLength = source.match(
    /tags: import_zod\.z\.array\(import_zod\.z\.string\(\)\.min\(1\)\.max\((\d+)\)/,
  );
  const serviceName = source.match(
    /serviceName: import_zod\.z\.string\(\)\.min\(1\)\.max\((\d+)\)/,
  );
  expect(
    tags?.[1] && tagLength?.[1] && serviceName?.[1],
    `could not read ResourceInfoSchema's caps out of ${SCHEMA_SOURCE}. The package changed shape; re-read the schema and update this parser rather than trusting the last numbers anyone wrote down.`,
  ).toBeTruthy();
  return {
    tags: Number(tags![1]),
    tagLength: Number(tagLength![1]),
    serviceName: Number(serviceName![1]),
  };
}

/** The regex the schema applies to tags and serviceName alike. */
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

describe("the resource block stays inside the schema that carries it", () => {
  it("reads the caps out of the installed package rather than a memory of them", () => {
    const caps = readResourceInfoCaps();
    // Sanity, not a pin: a cap of 0 or a wildly wrong parse should not
    // quietly make every assertion below trivially true.
    expect(caps.tags).toBeGreaterThan(0);
    expect(caps.tagLength).toBeGreaterThan(0);
    expect(caps.serviceName).toBeGreaterThan(0);
  });

  /**
   * THE ALARM. Today this passes at exactly the ceiling, and that is
   * correct — five tags is legal. What it buys is the sixth: the day
   * somebody adds one, this goes red here, at build time, instead of
   * at a facilitator after a buyer has signed.
   */
  it("never ships more tags than the payload schema will carry", () => {
    const caps = readResourceInfoCaps();
    expect(
      STORE_TAGS.length,
      `STORE_TAGS has ${STORE_TAGS.length} entries and ResourceInfoSchema takes ${caps.tags}. The extra one does not error here — the 402 still serves, header and all — it fails when the buyer's payload reaches the facilitator, which is the same path that made four doors unbuyable when their descriptions outgrew CDP's limit. Cut one, or the sixth is bought by nobody.`,
    ).toBeLessThanOrEqual(caps.tags);
  });

  it("keeps every tag inside the per-tag length and character rules", () => {
    const caps = readResourceInfoCaps();
    for (const tag of STORE_TAGS) {
      expect(tag.length, `tag "${tag}" is too long`).toBeLessThanOrEqual(
        caps.tagLength,
      );
      expect(tag, `tag "${tag}" is not printable ASCII`).toMatch(
        PRINTABLE_ASCII,
      );
    }
  });

  /**
   * The short service name exists because the real one is 37
   * characters and the field takes 32 — and the field is not
   * truncated, it is DROPPED, so an over-long name means our entries
   * in someone else's catalog go back to being anonymous URLs with
   * prices on them. That is the failure this pins.
   */
  it("keeps the service name inside the field that carries it", () => {
    const caps = readResourceInfoCaps();
    expect(STORE_SERVICE_NAME.length).toBeLessThanOrEqual(caps.serviceName);
    expect(STORE_SERVICE_NAME).toMatch(PRINTABLE_ASCII);
  });
});

/**
 * THE SECOND CEILING, AND THE FILED FINDING WAS WRONG ABOUT IT —
 * recorded here rather than quietly fixed, because a wrong reading
 * corrected out loud is the only kind that stops costing.
 *
 * The task said: a non-USDC rail would be silently swallowed by the
 * stock client's default-asset filter. The mechanism is real — spend
 * controls keep only assets the scheme lists as default, and that
 * filter runs BEFORE the price is looked at, so a dropped rail
 * produces no error, no decline and no 402 anywhere.
 *
 * BUT THIS STORE CANNOT REACH THAT STATE BY ACCIDENT, and the reason
 * is worth writing down. Walking all 34 routes and all 100 accepts
 * `railAccepts` builds, the fields present are exactly:
 *
 *     scheme, network, price, payTo, maxTimeoutSeconds
 *
 * There is NO `asset`. The store names a price and a network and lets
 * `@x402/evm`'s own `getDefaultAsset` resolve the token. You cannot
 * type the wrong address into a field you never write, so the risk as
 * filed — a rail in some token nobody checked — has no code path.
 *
 * SO THE GUARD IS INVERTED, and it is the better one. It does not ask
 * "is every asset on the table"; that question is vacuous while the
 * answer is delegated. It asks: DOES ANY ACCEPT NAME AN ASSET AT ALL?
 * The day one does, somebody has taken token choice back from the
 * scheme package, and that is precisely the edit that can introduce a
 * token stock clients drop. This makes them say so on purpose.
 */
describe("token choice stays delegated to the scheme's own table", () => {
  it("names no asset on any accept, on any route", () => {
    const routes = buildRoutesConfig(testEnv) as Record<
      string,
      { accepts?: { network?: unknown; asset?: unknown; price?: unknown }[] }
    >;
    const accepts = Object.values(routes).flatMap(
      (config) => config.accepts ?? [],
    );
    // A guard over an empty list is a guard that cannot fail.
    expect(accepts.length).toBeGreaterThan(50);

    const named = accepts
      .filter((accept) => accept.asset !== undefined)
      .map((accept) => `${String(accept.network)} ${String(accept.asset)}`);
    expect(
      named,
      "an accept names an asset explicitly. That takes token choice back from @x402/evm's default table, which is the one way this store could start offering a rail a stock client silently drops — its spend controls filter on that table BEFORE they look at the price, so the accept vanishes with no error, no decline and no 402 anywhere. If this is deliberate, confirm the asset is on the scheme's default table for that network, or tell buyers to set spendControls.allowedAssets, and then say so here.",
    ).toEqual([]);

    // The positive half: every accept prices in dollars, which is the
    // form that lets the scheme resolve the token itself.
    for (const accept of accepts) {
      expect(typeof accept.price).toBe("string");
      expect(String(accept.price)).toMatch(/^\$\d/);
    }
  });

  /**
   * The lookup this store's dry run relies on (#96) really does
   * discriminate — worth pinning here too, because the paragraph above
   * argues from what `getDefaultAsset` resolves, and an argument from
   * a function that says yes to everything would be worthless.
   */
  it("can tell a default asset from an invented one", () => {
    const usdcBase = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    expect(findEvmDefaultAsset(usdcBase, "eip155:8453")).toBeTruthy();
    expect(
      findEvmDefaultAsset(
        "0xdead000000000000000000000000000000000000",
        "eip155:8453",
      ),
    ).toBeFalsy();
  });
});
