import { houseWallets } from "@/lib/channel";
import { KV_KEYS } from "@/lib/kv-keys";
import { certificatesForPayer, type ClaimedCertificate } from "@/services/certificates";
import { listCorpus } from "@/services/corpus";
import { CORRECTIONS } from "@/store/corrections";
import { FIRST_KEY_IN_SERVICE_FROM, RETIRED_KEYS } from "@/store/key-registry";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

/**
 * THE TRUST PANEL — every trust surface the store keeps, on one page
 * (outside-reads log item 6; three independent reads found the
 * substrate scattered across eight rooms and said so).
 *
 * DERIVED, NEVER RESTATED: every number here is read from the same
 * source its deep room reads, so the panel cannot drift from the
 * rooms it summarizes — the same law the front counter and the rooms
 * guard enforce elsewhere. The panel adds links and arithmetic,
 * never new claims.
 *
 * THE GALLERY'S PRIVACY LINE: sample artifacts shown are HOUSE
 * purchases only. A certificate id is a capability URL — publishing
 * a stranger's would leak their purchase — so the gallery derives
 * from the house wallets' own buying, which is exactly what a sample
 * should be anyway: artifacts we paid real money for, verifiable by
 * anyone.
 */

/** The expensive half (two capped KV scans) recomputes at most hourly. */
const PANEL_CACHE_TTL_SECONDS = 3600;
const GALLERY_SIZE = 5;
/** House wallets scanned for gallery certs. The scan is per wallet
 * and capped inside certificatesForPayer; three covers the founding
 * burner, the walkabout, and one keeper addition. */
const GALLERY_WALLET_CAP = 3;

interface PanelCache {
  computed_at: string;
  corpus: { entries: number; latest_week: string | null };
  gallery: ClaimedCertificate[];
}

export interface TrustPanel {
  /** Static facts, free on every load. */
  key: {
    first_in_service_from: string;
    retired_keys: number;
    directory_url: string;
    anchor_log_url: string;
  };
  corrections: { total: number; latest: string | null; url: string };
  corpus: { entries: number; latest_week: string | null; url: string };
  gallery: {
    note: string;
    items: { item: string; date: string; verify_url: string }[];
  };
  computed_at: string;
}

async function computeCache(env: Env): Promise<PanelCache> {
  const records = await listCorpus(env);
  const gallery: ClaimedCertificate[] = [];
  for (const wallet of houseWallets(env).slice(0, GALLERY_WALLET_CAP)) {
    const { certificates } = await certificatesForPayer(env, wallet);
    gallery.push(...certificates);
  }
  gallery.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return {
    computed_at: new Date().toISOString(),
    corpus: {
      entries: records.length,
      latest_week: records[records.length - 1]?.snapshot.week ?? null,
    },
    gallery: gallery.slice(0, GALLERY_SIZE),
  };
}

async function cachedHalf(env: Env): Promise<PanelCache> {
  const stored = await kvGetJson<PanelCache>(env.COUNTERS, 
    KV_KEYS.trustPanelCache,
    "json",
  );
  if (stored) {
    const ageSeconds =
      (Date.now() - new Date(stored.computed_at).getTime()) / 1000;
    if (ageSeconds < PANEL_CACHE_TTL_SECONDS) return stored;
  }
  const fresh = await computeCache(env);
  await kvPut(env.COUNTERS, KV_KEYS.trustPanelCache, JSON.stringify(fresh));
  return fresh;
}

export async function buildTrustPanel(env: Env): Promise<TrustPanel> {
  const base = env.STORE_BASE_URL;
  const cache = await cachedHalf(env);
  const latestCorrection = CORRECTIONS.length
    ? [...CORRECTIONS.map((c) => c.date)].sort().at(-1)!
    : null;
  return {
    key: {
      first_in_service_from: FIRST_KEY_IN_SERVICE_FROM,
      retired_keys: RETIRED_KEYS.length,
      directory_url: `${base}/.well-known/scvd-signing-key`,
      anchor_log_url: `${base}/.well-known/anchor-log.json`,
    },
    corrections: {
      total: CORRECTIONS.length,
      latest: latestCorrection,
      url: `${base}/corrections`,
    },
    corpus: {
      entries: cache.corpus.entries,
      latest_week: cache.corpus.latest_week,
      url: `${base}/corpus`,
    },
    gallery: {
      note: "House purchases only — real artifacts this store paid real USDC for, so no buyer's certificate id is ever published by us. Verify any of them yourself, free, no account.",
      items: cache.gallery.map((cert) => ({
        item: cert.item,
        date: cert.date,
        verify_url: `${base}${cert.verify_path}`,
      })),
    },
    computed_at: cache.computed_at,
  };
}
