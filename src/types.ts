/**
 * Shared types for Sean-Claude Van Damme's General Store.
 * Every KV record shape and the Worker environment live here.
 */

export interface Env {
  ORDERS: KVNamespace;
  GUESTBOOK: KVNamespace;
  COUNTERS: KVNamespace;
  PATRONS: KVNamespace;
  /** Base wallet that receives USDC. Secret. */
  PAY_TO_ADDRESS: string;
  /** Coinbase Developer Platform facilitator credentials. Secrets. */
  CDP_API_KEY_ID: string;
  CDP_API_KEY_SECRET: string;
  /** ed25519 private key seed, 64 hex characters. Secret. */
  SIGNING_KEY: string;
  /** Basic Auth password for the keeper's back room. Secret. */
  ADMIN_PASSWORD: string;
  /** Public base URL, e.g. https://scvd.store */
  STORE_BASE_URL: string;
}

export type HonoEnv = { Bindings: Env };

export type ItemPricing = "fixed" | "pay_what_it_deserves";
export type ItemFulfillment = "instant" | "human_queue";

export interface MenuItem {
  id: string;
  name: string;
  /** Minimum (or fixed) price in USDC. */
  price_usdc: number;
  pricing: ItemPricing;
  fulfillment: ItemFulfillment;
  /** Delivery promise for human_queue items, in hours. */
  sla_hours?: number;
  /** Weekly stock for scarce items. Absent = unlimited. */
  weekly_inventory?: number;
  /** Whether a waitlist opens when inventory hits zero. */
  waitlist?: boolean;
  description: string;
  /** The line an agent sees on the 402 challenge. */
  note_402: string;
  constraints?: string[];
}

export type OrderStatus = "queued" | "completed";

export interface OrderRecord {
  order_id: string;
  item_id: string;
  item_name: string;
  status: OrderStatus;
  created_at: string;
  sla_hours: number;
  paid_usdc: number;
  tip_usdc: number;
  payer?: string;
  agent_name?: string;
  callback_url?: string;
  patron_number: number;
  cert_id: string;
  deliverable?: string;
  completed_at?: string;
}

export interface Certificate {
  cert_id: string;
  item: string;
  patron_number: number;
  name?: string;
  date: string;
  tip_usdc?: number;
}

export interface CertificateRecord {
  certificate: Certificate;
  signature: string;
  public_key: string;
}

export interface PatronRecord {
  patron_number: number;
  cert_id: string;
  item: string;
  name?: string;
  date: string;
}

export interface GuestbookEntry {
  id: string;
  name: string;
  message: string;
  date: string;
}

export interface WaitlistEntry {
  item_id: string;
  agent_name?: string;
  callback_url?: string;
  date: string;
}

export interface CommissionRequest {
  id: string;
  description: string;
  offer_usdc: number;
  contact: string;
  date: string;
}

export interface WeeklyDigest {
  generated_at: string;
  week_note: string;
  orders_total: number;
  orders_queued: number;
  orders_completed: number;
  orders_overdue: number;
  revenue_usdc: number;
  tips_usdc: number;
  bell_count: number;
  guestbook_entries: number;
  waitlist_entries: number;
  commission_requests: CommissionRequest[];
  failed_item_requests: Record<string, number>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
