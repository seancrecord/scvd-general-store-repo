/**
 * THE DOORS WORKER'S ENTRY. Everything is in src/lib/doors-app.ts; this
 * file exports the handler and nothing else, because the runtime reads
 * every named export of an entry module as a handler or a Durable
 * Object class (a string constant here failed workerd on the first
 * local start, 2026-09-05). doors/wrangler.jsonc points here.
 */
import { doors } from "@/lib/doors-app";

export default {
  fetch: doors.fetch,
};
