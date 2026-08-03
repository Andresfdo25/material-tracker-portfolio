// listFilter.ts — the channel the Overview rail uses to hand a filter to the Material
// List (lote 63, adapted: portfolio has no Alerts screen, so the target is the Material
// List's own status filter). The three purchasing gauges (🔴 / 🟠 / ❔) already navigated
// to the list; they landed on the whole thing and made the PM re-click the status chip
// every time. Since the list's filter already lives in localStorage through
// `usePersisted` — so the last view survives a reload — the channel is not new global
// state, it's THAT SAME value, written an instant before navigating.
//
// `Shell` mounts one screen at a time, so the Material List remounts from scratch on
// navigation and `usePersisted` reads the key in its initializer — no event needed today.
import { saveJSON } from './persist';
import type { ItemStatus } from './types';

/** The `usePersisted` key that backs the Material List's status filter. One constant for
 * both ends: renaming it here breaks the screen at compile time, not at runtime. */
export const LIST_FILTER_KEY = 'list:filter';

/** Leaves the status filter ready for the next mount of the Material List. Empty array =
 * no filter. */
export function presetListFilter(keys: ItemStatus[]): void {
  saveJSON(LIST_FILTER_KEY, keys);
}
