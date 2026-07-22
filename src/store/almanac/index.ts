import { fieldNotesBrisketJuly2026 } from "@/store/almanac/field-notes-brisket-july-2026";
import { notesFromATuesdayAtTheCrossing } from "@/store/almanac/notes-from-a-tuesday-at-the-crossing";
import type { AlmanacEntry } from "@/types";

/**
 * The Keeper's Almanac: a serialized journal, one markdown page per file
 * in this folder, a penny a page. Newest entries first. To add a page,
 * drop a new file here and add it to the list below.
 *
 * Content rule: entries are dated, first-person field notes — sensory,
 * particular, slightly strange. Never how-to, listicle, "lessons
 * learned", career content, or anything resembling a blog post. If it
 * could be posted on Medium, it doesn't go in the Almanac.
 */
export const ALMANAC_ENTRIES: readonly AlmanacEntry[] = [
  fieldNotesBrisketJuly2026,
  notesFromATuesdayAtTheCrossing,
] as const;

export function getAlmanacEntry(slug: string): AlmanacEntry | undefined {
  return ALMANAC_ENTRIES.find((entry) => entry.slug === slug);
}
