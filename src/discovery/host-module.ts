import {
  citeHostCapture,
  type PassportModule,
} from "@/discovery/cite-module";
import type { HostCatalogCapture } from "@/discovery/host-probe";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";
import { kvPut } from "@/lib/kv-retry";

/**
 * HOST PASSPORT MODULE — latest discovery_coherence citation per
 * host. Written when we already joined them (inventory or report).
 * The passport GET only reads. Lonely catalogs are not stored —
 * that is not_observed, and a passport does not cite a silent agree.
 */

function hostOf(about: string): string {
  return new URL(about).host.toLowerCase();
}

export async function citedModulesForHost(
  env: Env,
  host: string,
): Promise<PassportModule[]> {
  const cited = await readHostDiscoveryModule(env, host);
  return cited ? [cited] : [];
}

export async function readHostDiscoveryModule(
  env: Env,
  host: string,
): Promise<PassportModule | null> {
  const raw = await env.COUNTERS.get(
    KV_KEYS.hostDiscoveryModule(host.toLowerCase()),
  );
  if (!raw) return null;
  return JSON.parse(raw) as PassportModule;
}

export async function writeHostDiscoveryModule(
  env: Env,
  host: string,
  module: PassportModule,
): Promise<void> {
  await kvPut(env.COUNTERS, 
    KV_KEYS.hostDiscoveryModule(host.toLowerCase()),
    JSON.stringify(module),
  );
}

export async function rememberHostDiscoveryModule(input: {
  env: Env;
  capture: HostCatalogCapture;
  at: string;
  clock: string;
}): Promise<PassportModule | null> {
  const cited = await citeHostCapture({
    capture: input.capture,
    signingKeyHex: input.env.SIGNING_KEY,
    at: input.at,
    clock: input.clock,
    authorizationBase: input.env.STORE_BASE_URL,
  });
  if (!cited) return null;
  await writeHostDiscoveryModule(input.env, hostOf(input.capture.about), cited);
  return cited;
}
