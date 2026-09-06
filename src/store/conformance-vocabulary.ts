/**
 * THE VOCABULARIES, AT RUNTIME (2026-09-06).
 *
 * These three were TypeScript unions and nothing else, so every
 * surface that published them — the MCP output schema, the OpenAPI
 * contract — restated the words in prose an agent had to read rather
 * than in an enum a client could validate against. A WebMCP scan
 * named the input half of it ("kind lacks enum constraint"); the
 * output half was the same defect one field over. The unions below
 * are now derived FROM these arrays, so a fourth key_resolution
 * cannot be added to the code and left out of what callers are told.
 */
export const CONFORMANCE_VERDICTS = [
  "conforms",
  "does_not_conform",
  "could_not_check",
] as const;
export const CONFORMANCE_KINDS = ["offer", "receipt"] as const;
export const KEY_RESOLUTIONS = [
  "offline",
  "did:web",
  "not_attempted",
  "budget_exhausted",
] as const;
