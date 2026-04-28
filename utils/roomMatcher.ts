/**
 * roomMatcher.ts
 *
 * Fuzzy + synonym-based room name matching.
 * Handles Dutch ↔ English synonyms and partial-name matches (e.g. "Slaapkamer 1" ↔ "slaapkamer").
 */

/** Synonym groups: each array is a set of equivalent room-type tokens. */
const SYNONYM_GROUPS: string[][] = [
  // Woonkamer
  ['woonkamer', 'woon', 'living', 'salon', 'huiskamer', 'zitkamer', 'lounge', 'livingroom'],
  // Keuken
  ['keuken', 'kitchen', 'kook', 'kookhoek'],
  // Badkamer
  ['badkamer', 'bathroom', 'douche', 'doucheruimte', 'shower', 'washroom'],
  // Toilet / WC
  ['toilet', 'wc', 'toiletruimte', 'halfbad', 'lavatory', 'restroom', 'halfbad', 'bj', 'half bath'],
  // Slaapkamer
  ['slaapkamer', 'slaap', 'bedroom', 'master bedroom', 'master', 'guest room', 'logeer', 'logerkamer'],
  // Hal / Entree / Gang
  ['hal', 'entree', 'gang', 'hallway', 'hall', 'corridor', 'vestibule', 'overloop', 'landing', 'portaal'],
  // Kantoor / Werkkamer
  ['kantoor', 'werkkamer', 'studeerkamer', 'office', 'study', 'werk', 'hobbyruimte'],
  // Berging / Bijkeuken / Garage
  ['berging', 'bijkeuken', 'garage', 'utility', 'storage', 'opslag', 'schuur', 'kelder', 'basement'],
  // Zolder / Vliering
  ['zolder', 'vliering', 'attic', 'loft', 'zolderruimte'],
  // Terras / Balkon
  ['terras', 'balkon', 'terrace', 'balcony', 'patio'],
  // Tuin
  ['tuin', 'garden', 'backyard'],
  // MK / Meterkast
  ['mk', 'meterkast', 'meter', 'utility closet', 'cv', 'cv-ruimte'],
];

/** Normalize a name: lowercase, trim, collapse whitespace, strip hyphens/underscores. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Find which synonym group index a normalized token belongs to, or -1 if none. */
function synonymGroupIndex(token: string): number {
  return SYNONYM_GROUPS.findIndex(group => group.some(syn => token.includes(syn) || syn.includes(token)));
}

/**
 * Returns true when `geminiName` (returned by the AI) refers to the same
 * room as `floorplanName` (from the FML floor plan).
 *
 * Matching order:
 *  1. Exact case-insensitive match
 *  2. One name is a substring of the other (handles numbered rooms)
 *  3. Both names share the same synonym group
 */
export function roomNamesMatch(geminiName: string, floorplanName: string): boolean {
  if (!geminiName || !floorplanName) return false;

  const a = normalize(geminiName);
  const b = normalize(floorplanName);

  // 1. Exact
  if (a === b) return true;

  // 2. Substring — e.g. "slaapkamer" ↔ "slaapkamer 1"
  if (a.includes(b) || b.includes(a)) return true;

  // 3. Synonym group
  const ga = synonymGroupIndex(a);
  const gb = synonymGroupIndex(b);
  if (ga !== -1 && ga === gb) return true;

  return false;
}

/**
 * Find the best matching room from a list of room names for a given AI-returned name.
 * Returns the matching room name, or undefined if no match found.
 */
export function findMatchingRoomName(geminiName: string, roomNames: string[]): string | undefined {
  // Prefer exact match first
  const exact = roomNames.find(n => normalize(n) === normalize(geminiName));
  if (exact) return exact;

  // Then fuzzy/synonym
  return roomNames.find(n => roomNamesMatch(geminiName, n));
}
