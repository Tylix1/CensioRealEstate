/**
 * The text layer of an uploaded PDF, read on the server with unpdf (PDF.js). The quote check (spec §6.1) compares
 * each extracted quote with the text of its stated page.
 *
 * PDF.js takes ownership of the bytes it is given and detaches their buffer, so both helpers hand it a copy: the
 * caller's bytes stay intact for hashing and for sending the PDF to Claude.
 */
import { extractText, getDocumentProxy } from "unpdf";

/** Number of pages, read from the document's page tree without extracting any text. Throws if the PDF is unreadable. */
export async function countPages(pdf: Uint8Array): Promise<number> {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  try {
    return doc.numPages;
  } finally {
    await doc.loadingTask.destroy();
  }
}

/**
 * The text of each page: element `n − 1` is page `n`. Text runs are joined as PDF.js reports them, with a line break
 * after each run that ends a line. Throws if the PDF is unreadable.
 */
export async function pageTexts(pdf: Uint8Array): Promise<string[]> {
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: false });
  return text;
}
