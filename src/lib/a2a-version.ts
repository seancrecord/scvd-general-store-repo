/** Negotiation is separate from the paid audit's frozen 0.3 schema. */
export const A2A_CURRENT_VERSION = "1.0";
export const A2A_LEGACY_VERSION = "0.3";
export type A2aVersion = typeof A2A_CURRENT_VERSION | typeof A2A_LEGACY_VERSION;

export function a2aVersion(header: string | undefined): A2aVersion | null {
  // A2A v1 §3.6: absent/empty means 0.3; patch components do not negotiate.
  if (!header?.trim()) return A2A_LEGACY_VERSION;
  const match = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(header.trim());
  const version = match ? `${match[1]}.${match[2]}` : null;
  return version === A2A_CURRENT_VERSION || version === A2A_LEGACY_VERSION ? version : null;
}

export function a2aVersionError(id: unknown = null) {
  return { jsonrpc: "2.0", id: typeof id === "string" || (typeof id === "number" && Number.isSafeInteger(id)) ? id : null, error: { code: -32009, message: `Version not supported. Send A2A-Version: ${A2A_CURRENT_VERSION} or ${A2A_LEGACY_VERSION}.` } };
}
