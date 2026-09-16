import { ucpProfile } from "@/lib/ucp/profile";
import { lookupResponse, searchResponse } from "@/lib/ucp/responses";
import { coreCommerceItems, requireCommerce } from "@/store/commerce";
import type { Env } from "@/types";

/**
 * THE DOCUMENTS THE CONFORMANCE GATE VALIDATES, built from the same
 * code the Worker serves.
 *
 * Not fixtures. A fixture is a photograph of what the store emitted on
 * the day somebody regenerated it, and a conformance gate pointed at a
 * photograph passes for the wrong reason. These call the real builders.
 *
 * The env is a stand-in with every rail configured, because the profile
 * is generated from whichever rails have a receiving wallet and the
 * gate should validate the widest document the store can emit rather
 * than the narrowest. The addresses are obviously-fake constants, never
 * secrets: the shapes are what is under test.
 */
const SAMPLE_EVM = "0x1111111111111111111111111111111111111111";
const SAMPLE_SOLANA = "11111111111111111111111111111111";

function sampleEnv(base: string): Env {
  return {
    STORE_BASE_URL: base,
    PAY_TO_ADDRESS: SAMPLE_EVM,
    POLYGON_PAY_TO: SAMPLE_EVM,
    ARBITRUM_PAY_TO: SAMPLE_EVM,
    WORLD_PAY_TO: SAMPLE_EVM,
    SOLANA_PAY_TO: SAMPLE_SOLANA,
  } as unknown as Env;
}

export function profileSample(base: string): unknown {
  return ucpProfile(sampleEnv(base));
}

/** The whole shelf, so every product and variant is validated. */
export function searchSample(base: string): unknown {
  return searchResponse(base, "", coreCommerceItems().length);
}

/**
 * A batch that exercises every resolution path the lookup response can
 * report: a shelf id, a handle, an SKU, a tier SKU, an item that is
 * real but excluded from this catalog, and one that does not exist.
 */
export function lookupSample(base: string): unknown {
  const excluded = coreCommerceItems();
  const first = excluded[0]!;
  return lookupResponse(base, [
    "service_audit",
    "service-audit",
    requireCommerce(first).sku,
    "SCVD-THE-COLLAB-T5",
    "gid://scvd.store/Variant/hello",
    "spot_check",
    "no-such-product",
  ]);
}
