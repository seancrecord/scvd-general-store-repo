/** Traffic counters are persistent additive effects, including on free calls. */
export const METERED_TOOL_EFFECTS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
} as const;

/** Shared verifier handlers; their external interaction is independent of metering. */
export const VERIFICATION_TOOL_WORLD = {
  preflight_endpoint: true,
  check_conformance: true,
  verify_artifact: false,
} as const;

export function isVerificationTool(name: string): name is keyof typeof VERIFICATION_TOOL_WORLD {
  return Object.hasOwn(VERIFICATION_TOOL_WORLD, name);
}
