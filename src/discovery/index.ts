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
  selfPassportModules,
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
export { citeHostCapture, citeWrappedJoin } from "@/discovery/cite-module";
export {
  readHostDiscoveryModule,
  rememberHostDiscoveryModule,
} from "@/discovery/host-module";
export { selfRowFromCatalogs, selfRowVerdict } from "@/discovery/self-row";
export type { SelfRowVerdict } from "@/discovery/self-row";
export {
  schemaFromMcpTools,
  schemaFromOpenApi,
  schemaFromX402,
} from "@/discovery/schema-claims";
export type { SchemaClaim } from "@/discovery/schema-claims";
export {
  SCHEMA_COHERENCE_CLASS,
  schemaJoinDisagreements,
  schemaNotObserved,
  schemaRowVerdict,
} from "@/discovery/schema-coherence";
export { schemaModuleFromCatalogs } from "@/discovery/schema-module";
export {
  buyRouteFor,
  hashSelectedSurface,
  selectedSurface,
} from "@/discovery/receipt-surface";
export type { SelectedSurface } from "@/discovery/receipt-surface";
export {
  RECEIPT_COHERENCE_CLASS,
  listPriceUsdc,
  receiptRowVerdict,
} from "@/discovery/receipt-coherence";
export type {
  ReceiptCertSide,
  ReceiptDisagreement,
  ReceiptJoinVerdict,
} from "@/discovery/receipt-coherence";
export type {
  SchemaDisagreement,
  SchemaJoinVerdict,
  SurfaceSchemaClaims,
} from "@/discovery/schema-coherence";
export {
  capabilityFromA2a,
  capabilityFromMcp,
  capabilityFromX402,
  normalizeTransport,
} from "@/discovery/capability-claims";
export type { CapabilityClaim } from "@/discovery/capability-claims";
export {
  CAPABILITY_COHERENCE_CLASS,
  capabilityJoinDisagreements,
  capabilityRowVerdict,
} from "@/discovery/capability-coherence";
export type {
  CapabilityDisagreement,
  CapabilityJoinVerdict,
  SurfaceCapabilityClaim,
} from "@/discovery/capability-coherence";
export {
  freshnessFromA2a,
  freshnessFromJson,
  freshnessFromX402,
  normalizeStamp,
} from "@/discovery/freshness-claims";
export type {
  FreshnessClaim,
  FreshnessField,
} from "@/discovery/freshness-claims";
export {
  FRESHNESS_COHERENCE_CLASS,
  freshnessJoinDisagreements,
  freshnessRowVerdict,
} from "@/discovery/freshness-coherence";
export type {
  FreshnessDisagreement,
  FreshnessJoinVerdict,
  SurfaceFreshnessClaim,
} from "@/discovery/freshness-coherence";
