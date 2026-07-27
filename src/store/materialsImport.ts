// materialsImport.ts — parses a grouped materials/estimate spreadsheet into rows the
// tracker can file into work packages.
//
// The shape it targets is the one every estimating tool exports some version of: item
// rows sit under section-title rows (first cell non-empty, e.g. "10 2800 Toilet, Bath,
// and Laundry Accessories"), the header row is preceded by metadata lines, and a
// "Summary" block closes the item area.
//
// Deliberately NOT written against one vendor's column names. Columns are located by
// fuzzy header matching (see ALIASES), so a file that calls the column "Qty",
// "Quantity" or "QTY." parses the same, extra columns are reported rather than fatal,
// and adding support for a new export format is an entry in ALIASES, not a new parser.
import { normalizeUm } from './logic';
import type { WpCatalogEntry } from './types';

export interface ImportSheetRow {
  name: string;
  part: string;
  qty: number;
  um: string;
  mfr: string;           // Manufacturer/Supplier column when the export has one → vendor
  costCode: string;      // e.g. "10-21-13-40"
  costCodeName: string;  // e.g. "Grab Bars"
  section: string;       // the source file's own group title the row sat under
  wp: string;            // explicit Work Package column value, when the export has one
  costType: string;      // "Material" / "Labor" / … (the sample's "Category" column)
}

export interface ImportParse {
  rows: ImportSheetRow[];
  /** Header columns the parser recognized nothing for — logged, then ignored. */
  unmappedColumns: string[];
}

/* Fuzzy header aliases — matched against lowercased, space-normalized header cells. */
const ALIASES: Record<string, string[]> = {
  name: ['name', 'item', 'item name', 'description', 'item description'],
  part: ['part', 'part number', 'part #', 'part no', 'part no.'],
  qty: ['quantity', 'qty'],
  um: ['u/m', 'uom', 'um', 'unit', 'unit of measure'],
  mfr: ['manufacturer', 'supplier', 'vendor', 'mfr', 'manufacturer/supplier/vendor'],
  costCode: ['cost code', 'costcode', 'cc'],
  costCodeName: ['cost code name'],
  wp: ['work package', 'workpackage', 'workpkg', 'wp'],
  costType: ['category', 'cost type', 'type'],
};

function norm(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}
function num(s: unknown): number {
  const n = Number(String(s ?? '').replace(/[$,%\s]/g, ''));
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Parses a grid of cells (from CSV or a spreadsheet's first sheet) into item rows.
 * Throws when the grid has no locatable header row — i.e. it isn't a materials list. */
export function parseImportGrid(grid: string[][]): ImportParse {
  // Locate the header row: any row carrying both a Name-like and a Quantity-like cell.
  const matchAlias = (cell: string, field: string) => ALIASES[field].includes(cell.toLowerCase());
  const headerIdx = grid.findIndex((r) => {
    const cells = r.map(norm);
    return cells.some((c) => matchAlias(c, 'name')) && cells.some((c) => matchAlias(c, 'qty'));
  });
  if (headerIdx < 0) {
    throw new Error('No item table found in this file — it needs a header row with a description column and a quantity column. Please check the file and try again.');
  }

  const header = grid[headerIdx].map(norm);
  const col: Record<string, number> = {};
  const claimed = new Set<number>();
  // Exact-alias matching per column; longer aliases ("cost code name") win over
  // shorter ones ("cost code") because each column is claimed at most once.
  for (const field of Object.keys(ALIASES)) {
    const idx = header.findIndex((h, i) => !claimed.has(i) && matchAlias(h, field));
    col[field] = idx;
    if (idx >= 0) claimed.add(idx);
  }
  const unmappedColumns = header.filter((h, i) => h && !claimed.has(i));
  if (unmappedColumns.length) {
    console.info('[Materials import] Columns present but not mapped (ignored):', unmappedColumns.join(' · '));
  }

  const cell = (r: string[], field: string) => (col[field] >= 0 ? norm(r[col[field]]) : '');

  const rows: ImportSheetRow[] = [];
  let section = '';
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    const first = norm(r[0]);
    const name = cell(r, 'name');
    const part = cell(r, 'part');
    // Section-title rows carry only their first cell; "Summary" closes the item list.
    if (first && !name && !part) {
      if (/^summary$/i.test(first)) break;
      section = first;
      continue;
    }
    if (!name && !part) continue; // blank scaffold row (e.g. the empty "Custom items" lines)
    rows.push({
      name: name || part,
      part: name ? part : '',
      qty: num(cell(r, 'qty')),
      um: normalizeUm(cell(r, 'um')),
      mfr: cell(r, 'mfr'),
      costCode: cell(r, 'costCode'),
      costCodeName: cell(r, 'costCodeName'),
      section,
      wp: cell(r, 'wp'),
      costType: cell(r, 'costType'),
    });
  }
  return { rows, unmappedColumns };
}

/* ----------------------------------------------------------------- classification */

export type ImportVia = 'work package' | 'section' | 'cost code' | 'uncategorized' | 'manual';

export interface ImportClass {
  via: ImportVia;
  prefix: string;
  label: string;
  /** Material rows import checked; Labor/Equipment/… start unchecked. */
  inc: boolean;
}

export const UNCATEGORIZED_LABEL = 'Uncategorized Items';

/** "10 2113.17 …" / "10-21-13-40" / "06-83-…" → catalog-style prefix "10.21" / "6.83". */
export function codeToPrefix(s: string): string | null {
  const m = String(s).match(/(\d{1,2})[\s.–-]*(\d{2})/);
  return m ? `${Number(m[1])}.${m[2]}` : null;
}

/** Grouping priority, most explicit first: a Work Package column → the file's own
 * section title → the Cost Code (first 5 digits) → Uncategorized. Each step falls
 * through only when the one above it has nothing to say. */
export function classifyImportRow(row: ImportSheetRow, catalog: WpCatalogEntry[]): ImportClass {
  const inc = !row.costType || /material/i.test(row.costType);
  const fromTitle = (title: string, via: ImportVia): ImportClass => {
    const pfx = codeToPrefix(title);
    if (pfx) {
      const hit = catalog.find((w) => w.prefix === pfx);
      return hit ? { via, prefix: hit.prefix, label: hit.label, inc } : { via, prefix: pfx, label: title, inc };
    }
    const byLabel = catalog.find((w) => w.label.toLowerCase() === title.toLowerCase());
    if (byLabel) return { via, prefix: byLabel.prefix, label: byLabel.label, inc };
    return { via, prefix: title, label: title, inc }; // dynamic custom WP (prefix = label, like manual custom titles)
  };

  if (row.wp) return fromTitle(row.wp, 'work package');
  if (row.section) return fromTitle(row.section, 'section');
  const pfx = codeToPrefix(row.costCode);
  if (pfx) {
    const hit = catalog.find((w) => w.prefix === pfx);
    return hit
      ? { via: 'cost code', prefix: hit.prefix, label: hit.label, inc }
      : { via: 'cost code', prefix: pfx, label: `${pfx}_ ${row.costCodeName || 'Imported'}`, inc };
  }
  return { via: 'uncategorized', prefix: UNCATEGORIZED_LABEL, label: UNCATEGORIZED_LABEL, inc };
}
