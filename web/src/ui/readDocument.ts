// Turns a dropped file into the text of a meeting brief. PDF, Markdown and plain text only.
export const MAX_BYTES = 20 * 1024 * 1024;
// The server accepts a brief of up to this many characters.
export const MAX_CHARS = 50_000;

export type DocKind = 'pdf' | 'text';

export function documentKind(name: string, type: string): DocKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  if (/\.(md|markdown|txt)$/.test(lower) || type === 'text/plain' || type === 'text/markdown') {
    return 'text';
  }
  return null;
}

// Cuts to the limit at a space, so a word is not split. `clipped` says if anything was dropped.
export function clipText(text: string): { text: string; clipped: boolean } {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CHARS) return { text: trimmed, clipped: false };
  const cut = trimmed.slice(0, MAX_CHARS);
  const space = cut.search(/\s\S*$/);
  return { text: (space > MAX_CHARS / 2 ? cut.slice(0, space) : cut).trim(), clipped: true };
}

// pdf.js gives a page as small pieces of text; `hasEOL` marks the end of a line.
export function joinPdfItems(items: readonly { str?: string; hasEOL?: boolean }[]): string {
  return items.map((i) => (i.str ?? '') + (i.hasEOL ? '\n' : '')).join('');
}

export interface LoadedDocument {
  name: string;
  text: string;
  clipped: boolean;
}

// Reads a PDF page by page and stops once it has more than the server will take.
async function readPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    let text = '';
    for (let n = 1; n <= pdf.numPages && text.length <= MAX_CHARS; n++) {
      const page = await pdf.getPage(n);
      text += joinPdfItems((await page.getTextContent()).items as { str?: string }[]) + '\n';
    }
    return text;
  } finally {
    void task.destroy();
  }
}

// Throws an Error whose message can be shown to the user as it is.
export async function readDocument(file: File): Promise<LoadedDocument> {
  const kind = documentKind(file.name, file.type);
  if (!kind) throw new Error('Only PDF, .md and .txt files can be used.');
  if (file.size > MAX_BYTES) throw new Error('That file is too big (the limit is 20 MB).');

  let raw: string;
  try {
    raw = kind === 'pdf' ? await readPdf(file) : await file.text();
  } catch {
    throw new Error('Could not read that file. It may be damaged or protected.');
  }
  const { text, clipped } = clipText(raw);
  if (!text) throw new Error('No text found in that file. A scanned PDF has no text to read.');
  return { name: file.name, text, clipped };
}
