// columns.ts — the material grid's column catalog. Pure data (no components) so
// ManageColumnsMenu can import it without tripping the fast-refresh lint rule.

export interface ColumnDef {
  key: string;
  label: string;
}

export const HIDEABLE_COLUMNS: ColumnDef[] = [
  { key: 'qty', label: 'QTY' },
  { key: 'um', label: 'U/M' },
  { key: 'vendor', label: 'Manufacturer / Vendor' },
  { key: 'lead', label: 'Lead (wks)' },
  { key: 'onsite', label: 'On-Site Req.' },
  { key: 'buyby', label: 'Buy-By' },
  { key: 'submittal', label: 'Submittal' },
  { key: 'po', label: 'PO#' },
  { key: 'poDate', label: 'PO Date' },
  { key: 'shipDate', label: 'Anticipated Ship/Delivery' },
  { key: 'notes', label: 'Notes / Comments' },
  // Key stays `received` on purpose — renaming it would orphan the persisted `cols`
  // map in every existing browser. Only the label changed when the install cycle landed.
  { key: 'received', label: 'Delivery / Installation' },
];
