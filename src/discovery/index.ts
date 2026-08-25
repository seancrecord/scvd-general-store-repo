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
export {
  DISCOVERY_COHERENCE_CLASS,
  buildDiffObservation,
  signDiffObservation,
} from "@/discovery/diff-observation";
export type {
  DiffCheckState,
  DiffObservationBlocks,
  DiffObservationInput,
} from "@/discovery/diff-observation";
export { signDiffEnvelope, wrapDiffEnvelope } from "@/discovery/diff-envelope";
export type { WrapDiffInput } from "@/discovery/diff-envelope";
export {
  discoveryModuleFromCatalogs,
  fetchSelfCatalogs,
  originCatalogFetcher,
  selfPassportDiscoveryModule,
} from "@/discovery/self-module";
export type {
  CatalogFetcher,
  PassportModule,
} from "@/discovery/self-module";
export {
  DISCOVERY_INVENTORY_VERSION,
  inventoryCandidates,
  inventoryOrigin,
} from "@/discovery/inventory";
export type {
  DiscoveryInventory,
  InventorySurfaceRow,
} from "@/discovery/inventory";
export { extractSurfaceClaims } from "@/discovery/inventory-extract";
export { probeHostCatalogs } from "@/discovery/host-probe";
export type { HostCatalogCapture, HostSurfaceRow } from "@/discovery/host-probe";
export {
  issueDiscoveryReport,
  readDiscoveryReport,
  signHostDiscoveryReport,
} from "@/discovery/sign-report";
export type { DiscoveryReportRecord } from "@/discovery/sign-report";
export {
  compareCatalogSnapshots,
  rememberInventoryLook,
} from "@/discovery/snapshot";
export type { SnapshotCompare } from "@/discovery/snapshot";
