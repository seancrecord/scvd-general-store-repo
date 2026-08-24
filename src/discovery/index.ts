export {
  OWNED_DISCOVERY_SURFACES,
  shelfBearingSurfaces,
  type DiscoverySurfaceKind,
  type OwnedDiscoverySurface,
} from "@/discovery/self-surfaces";
export {
  IDENTITY_KINDS,
  bindClaims,
  compareClaims,
  isIdentityKind,
  joinClaimSets,
  normalizeIdentity,
  originOf,
} from "@/discovery/binding";
export type {
  Binding,
  BindingQuestion,
  BindingStrength,
  ClaimSetJoin,
  IdentityClaim,
  IdentityKind,
} from "@/discovery/binding";
export {
  claimsFromA2a,
  claimsFromLlmsTxt,
  claimsFromMcpItemIds,
  claimsFromMenuJson,
  claimsFromOpenApi,
  claimsFromSkillMd,
  claimsFromX402Json,
} from "@/discovery/claims";
export {
  assembleSelfRow,
  selfJoinDisagreements,
} from "@/discovery/self-coherence";
export type {
  FetchedSelfRow,
  SelfJoinDisagreement,
  SurfaceClaims,
} from "@/discovery/self-coherence";
