// catalogs.ts — the two controlled lists a fresh database starts with. Kept free of
// imports on purpose: `logic.ts` needs them inside `migrateDb`, and `demoData.ts` needs
// both them and `logic.ts`, so this module sits underneath both and the graph stays acyclic.
//
// Everything here is INVENTED. This repo is a public portfolio build, so the vendor list
// is fictional companies rather than the real manufacturers a working install would carry
// — see README.md § "The demo data". The work-package codes, by contrast, are the real
// CSI MasterFormat division/section numbering, because that numbering IS the domain: it
// is a public standard, and the importer's whole cost-code matching story only makes
// sense against it.
import type { WpCatalogEntry } from '../store/types';

/** Seed only — the live, editable list lives in `Db.vendors` (see buildDb / addVendor).
 * Alphabetical, which is also the order the app keeps it in. */
export const VENDORS_SEED = [
  'Alders & Vane Supply',
  'Beckhorn Washroom Systems',
  'Cardinal Point Lockers',
  'Drayton Sign Works',
  'Eastvale Millwork',
  'Fenwick Safety Group',
  'Granite Row Distribution',
  'Harlow Partition Co.',
  'Ironwood Wall Systems',
  'Juniper Shade & Drapery',
  'Kingsford Fixtures',
  'Larkspur Interiors Supply',
  'Meridian Panel Works',
  'Northline Fixtures Co.',
  'Oakbend Industrial',
  'Pelham Locker Works',
  'Quarry Lane Hardware',
  'Redstone Specialties',
  'Saltmarsh Glass & Mirror',
  'Thornbury Metalcraft',
  'Umberland Coatings',
  'Vantage Site Products',
  'Westerly Access Products',
];

/** Master work-package catalog. `prefix` is the cost-code key the materials importer
 * matches a row's cost code onto (see `classifyImportRow`). The 10.00_xx administrative
 * packages are not cost-code-matched — they are picked by hand. */
export const WP_CATALOG: WpCatalogEntry[] = [
  { prefix: '6.83', label: '6.83_ FRP' },
  { prefix: '10.11', label: '10.11_ Visual Display Units' },
  { prefix: '10.14', label: '10.14_ Signage' },
  { prefix: '10.21', label: '10.21_ Toilet Compartments' },
  { prefix: '10.23', label: '10.23_ Cubicle Curtains and Track' },
  { prefix: '10.26', label: '10.26_ Wall Protection' },
  { prefix: '10.28', label: '10.28_ Toilet Accessories' },
  { prefix: '10.44', label: '10.44_ Fire Protection Specialties' },
  { prefix: '10.51', label: '10.51_ Lockers and Mailboxes' },
  { prefix: '10.75', label: '10.75_ Building Specialties' },
  { prefix: '12.24', label: '12.24_ Window Shades' },
  { prefix: '10.00_01', label: '10.00_01 Change Order' },
  { prefix: '10.00_02', label: '10.00_02 Alternate' },
  { prefix: '10.00_03', label: '10.00_03 Material Re-Order' },
  { prefix: '10.00_04', label: '10.00_04 Material Replacement' },
  { prefix: '10.00_05', label: '10.00_05 Other Accessories' },
  { prefix: '10.00_06', label: '10.00_06 Other Specialties' },
];
