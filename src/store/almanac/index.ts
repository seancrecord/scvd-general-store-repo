import { fieldNotesBrisketJuly2026 } from "@/store/almanac/field-notes-brisket-july-2026";
import { notesFromATuesdayInApex } from "@/store/almanac/notes-from-a-tuesday-in-apex";
import { whatShippingThreeIosAppsTaughtMe } from "@/store/almanac/what-shipping-three-ios-apps-taught-me";
import type { AlmanacEntry } from "@/types";

/**
 * The Keeper's Almanac: a serialized journal, one markdown page per file
 * in this folder, a penny a page. Newest entries first. To add a page,
 * drop a new file here and add it to the list below.
 */
export const ALMANAC_ENTRIES: readonly AlmanacEntry[] = [
  fieldNotesBrisketJuly2026,
  whatShippingThreeIosAppsTaughtMe,
  notesFromATuesdayInApex,
] as const;

export function getAlmanacEntry(slug: string): AlmanacEntry | undefined {
  return ALMANAC_ENTRIES.find((entry) => entry.slug === slug);
}
