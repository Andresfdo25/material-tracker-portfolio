// csv.ts — generic CSV → cell grid. Fields can be quoted and contain embedded commas and
// newlines, so this is a real state-machine parser rather than a naive split on ",".
// The only consumer is the materials import (`materialsImport.ts` reads the grid and locates its
// own header row); the .xlsx path feeds it the same shape via SheetJS.

/** CSV text → rows of raw cells. Handles quoted fields, "" escapes and CRLF. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\r') {
      // ignore — \n (or EOF) handles the row break
    } else if (c === '\n') {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) pushRow();
  return rows;
}
