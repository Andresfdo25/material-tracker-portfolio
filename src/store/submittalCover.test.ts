// submittalCover.test.ts — guards the contract between the generated AcroForm template
// (scripts/build-submittal-template.mjs) and the code that fills it.
//
// It is a contract split across two files that never import each other: the generator
// names the fields and places the artwork, the filler looks those names up by string and
// clips that artwork by coordinate. Nothing in the type system connects them, so a
// renamed field or a moved band fails at runtime, in a lazily-loaded chunk, only for the
// user who clicked "Create submittal cover". These tests move that failure to CI.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONT_ROWS_PER_PAGE, COVER_ROWS_PER_PAGE, generateSubmittalCover, type CoverHeader, type CoverRow } from './submittalCover';

const TEMPLATE = fileURLToPath(new URL('../assets/submittal-cover.pdf', import.meta.url));

let bytes: Buffer;
beforeAll(() => { bytes = readFileSync(TEMPLATE); });

/** A fresh ArrayBuffer per call — pdf-lib takes ownership of what it is handed. */
const template = () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const header: CoverHeader = {
  toName: 'Vantree Builders', toAddress: '88 Harbor Way\nPortland, OR 97209', re: 'Northgate Medical Fit-Out',
  date: '07/26/2026', sentVia: 'e-mail', title: '10.28 Toilet Accessories', number: 'SUB-014',
  types: { productData: true, shopDrawings: false, samples: true, other: true },
  revs: { productData: '0', shopDrawings: '', samples: '1', other: '' },
  otherText: 'Maintenance data',
};
const rows = (n: number): CoverRow[] =>
  Array.from({ length: n }, (_, i) => ({ ref: `10.28.${i + 1}`, product: `Sample product ${i + 1}`, qty: String(i + 1), mfr: 'Northline Fixtures Co.' }));

describe('the submittal cover template', () => {
  it('carries every field the filler writes to, under the exact names it uses', async () => {
    const doc = await PDFDocument.load(template());
    const names = new Set(doc.getForm().getFields().map((f) => f.getName()));
    [
      'To name', 'To Address', 'RE:', 'Date', 'Sent Via', 'SUMITTAL TITLE:', 'Submittal number', 'Other:',
      'Check Box1', 'Check Box1(1)', 'Check Box1(2)', 'Check Box1(3)', 'Rev(1)', 'Rev(2)', 'Rev(3)', 'Rev(4)',
    ].forEach((n) => expect(names, n).toContain(n));
    // The reviewer's own certification boxes: we never check them, but they have to exist.
    ['Check Box1(4)', 'Check Box1(5)', 'Check Box1(6)'].forEach((n) => expect(names, n).toContain(n));
    for (let r = 1; r <= COVER_ROWS_PER_PAGE; r++) {
      ['Spec / Arq Ref.', 'item/Product', 'QTY', 'Manufacturer / Series'].forEach((c) => expect(names, `${c}(${r})`).toContain(`${c}(${r})`));
    }
  });

  it('is legal-size media with a letter-size CropBox', async () => {
    const page = (await PDFDocument.load(template())).getPage(0);
    expect(page.getSize()).toMatchObject({ width: 612, height: 1008 });
    const crop = page.getCropBox();
    // Continuation pages copy this box. If the template ever ships without it they print
    // at a different size than the cover they are stapled to.
    expect(Math.round(crop.y)).toBe(216);
    expect(Math.round(crop.height)).toBe(792);
  });

  it('fills the cover in place for a submittal that fits on one page', async () => {
    const out = await generateSubmittalCover(template(), header, rows(4));
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
    const form = doc.getForm();
    expect(form.getTextField('To name').getText()).toBe('Vantree Builders');
    expect(form.getTextField('SUMITTAL TITLE:').getText()).toBe('10.28 Toilet Accessories');
    expect(form.getTextField('item/Product(4)').getText()).toBe('Sample product 4');
    expect(form.getCheckBox('Check Box1').isChecked()).toBe(true);
    expect(form.getCheckBox('Check Box1(1)').isChecked()).toBe(false); // shop drawings unticked
    expect(form.getTextField('Other:').getText()).toBe('Maintenance data');
    // Row 5 exists but stays empty — an unfilled row must not inherit the one above it.
    expect(form.getTextField('item/Product(5)').getText()).toBeUndefined();
  });

  it('spills onto continuation sheets whose fields never collide with the cover’s', async () => {
    // One more row than the cover plus a full continuation sheet holds, so the run is
    // forced onto a third page and the page-suffix naming has to actually disambiguate.
    const total = COVER_ROWS_PER_PAGE + CONT_ROWS_PER_PAGE + 1;
    const doc = await PDFDocument.load(await generateSubmittalCover(template(), header, rows(total)));
    expect(doc.getPageCount()).toBe(3);

    const form = doc.getForm();
    // Every generated field is uniquely named, or pdf-lib would silently merge the
    // duplicates into one widget showing the same text in both places.
    const names = form.getFields().map((f) => f.getName());
    expect(new Set(names).size).toBe(names.length);

    // The last row of the cover, the first of sheet 2 and the only one on sheet 3 are
    // three consecutive source rows landing in three different places.
    expect(form.getTextField(`item/Product(${COVER_ROWS_PER_PAGE})`).getText()).toBe(`Sample product ${COVER_ROWS_PER_PAGE}`);
    expect(form.getTextField('item/Product(1)~p2').getText()).toBe(`Sample product ${COVER_ROWS_PER_PAGE + 1}`);
    expect(form.getTextField('item/Product(1)~p3').getText()).toBe(`Sample product ${total}`);
    // Sheet 3 is padded out to a full frame, so its trailing rows exist and are blank.
    expect(form.getTextField(`item/Product(${CONT_ROWS_PER_PAGE})~p3`).getText()).toBeUndefined();

    doc.getPages().slice(1).forEach((pg, i) => {
      expect(pg.getSize(), `page ${i + 2} size`).toMatchObject({ width: 612, height: 1008 });
      expect(Math.round(pg.getCropBox().y), `page ${i + 2} cropbox`).toBe(216);
    });
  });
});
