import { describe, expect, it } from 'vitest';
import {
  MAX_BYTES,
  MAX_CHARS,
  clipText,
  documentKind,
  joinPdfItems,
  readDocument,
} from './readDocument';

const file = (name: string, content: string, type = '') => new File([content], name, { type });

describe('documentKind', () => {
  it('knows PDF, Markdown and plain text by name or type', () => {
    expect(documentKind('Agenda.PDF', '')).toBe('pdf');
    expect(documentKind('x', 'application/pdf')).toBe('pdf');
    expect(documentKind('notes.md', '')).toBe('text');
    expect(documentKind('notes.markdown', '')).toBe('text');
    expect(documentKind('NOTES.TXT', '')).toBe('text');
    expect(documentKind('x', 'text/plain')).toBe('text');
  });

  it('refuses everything else', () => {
    expect(documentKind('slides.pptx', '')).toBeNull();
    expect(documentKind('photo.png', 'image/png')).toBeNull();
    expect(documentKind('noextension', '')).toBeNull();
    expect(documentKind('pdf', '')).toBeNull();
  });
});

describe('clipText', () => {
  it('leaves a short text alone, trimmed', () => {
    expect(clipText('  hello  ')).toEqual({ text: 'hello', clipped: false });
    const exact = 'a'.repeat(MAX_CHARS);
    expect(clipText(exact)).toEqual({ text: exact, clipped: false });
  });

  it('cuts a long text at a space and says so', () => {
    const long = `${'word '.repeat(MAX_CHARS)}`;
    const r = clipText(long);
    expect(r.clipped).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(r.text.endsWith('word')).toBe(true);
  });

  it('cuts a long text with no spaces at the limit', () => {
    const r = clipText('x'.repeat(MAX_CHARS + 10));
    expect(r).toEqual({ text: 'x'.repeat(MAX_CHARS), clipped: true });
  });
});

describe('joinPdfItems', () => {
  it('joins the pieces and ends a line where the PDF does', () => {
    expect(joinPdfItems([{ str: 'Q3 ' }, { str: 'review', hasEOL: true }, { str: 'Next' }])).toBe(
      'Q3 review\nNext',
    );
  });

  it('copes with pieces that have no text', () => {
    expect(joinPdfItems([{}, { str: 'a' }, { hasEOL: true }])).toBe('a\n');
    expect(joinPdfItems([])).toBe('');
  });
});

describe('readDocument', () => {
  it('reads a text file', async () => {
    const r = await readDocument(file('agenda.md', '# Agenda\n\nRenewal of the licence'));
    expect(r).toEqual({
      name: 'agenda.md',
      text: '# Agenda\n\nRenewal of the licence',
      clipped: false,
    });
  });

  it('reports a clipped long file', async () => {
    const r = await readDocument(file('big.txt', 'lorem '.repeat(20_000)));
    expect(r.clipped).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(MAX_CHARS);
  });

  it('rejects an unsupported type with a message for the user', async () => {
    await expect(readDocument(file('slides.pptx', 'x'))).rejects.toThrow(/Only PDF/);
  });

  it('rejects a file over the size limit without reading it', async () => {
    const big = file('big.txt', 'x');
    Object.defineProperty(big, 'size', { value: MAX_BYTES + 1 });
    await expect(readDocument(big)).rejects.toThrow(/too big/);
  });

  it('rejects an empty file', async () => {
    await expect(readDocument(file('empty.txt', '  \n '))).rejects.toThrow(/No text found/);
  });

  it('rejects a damaged PDF instead of crashing', async () => {
    await expect(readDocument(file('bad.pdf', 'not a pdf', 'application/pdf'))).rejects.toThrow(
      /Could not read/,
    );
  });
});
