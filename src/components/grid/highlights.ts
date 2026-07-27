// highlights.ts — the row highlighter palette, shared by the row menu (one row), the
// selection bar (many rows) and the grid (painting the row).

/** Highlighter row flags — fill a row's background so the PM can spot noteworthy items
 * (e.g. rows with notes) at a glance. Three fluorescent marker tones, plus clear. */
export const HIGHLIGHTS: { key: string; token: string; label: string }[] = [
  { key: 'yellow', token: 'var(--hl-yellow)', label: 'Yellow' },
  { key: 'green', token: 'var(--hl-green)', label: 'Green' },
  { key: 'pink', token: 'var(--hl-pink)', label: 'Fuchsia' },
];

export const hlToken = (k?: string) => HIGHLIGHTS.find((h) => h.key === k)?.token;
