/**
 * Reading the wizard's documents (C3.2, spec §6.1): every PDF is posted to POST /api/extract with the stored access
 * code, at most 5 at a time, and the answer is written into the draft. Browser-only; import it from client components.
 *
 * The queue lives in this module, not in a component, so a reading goes on while the client looks at another step or
 * page, and its answer lands in whatever the draft is by then: a document that was removed, or a draft that was
 * submitted or reset meanwhile, simply drops it. After a reload nothing is in flight, so `resumeReading` restarts the
 * documents the draft still shows as being read, from their copies in IndexedDB.
 */
import type { ExtractResponse } from "@/app/api/extract/route";
import { SAMPLE_DOCUMENT_FILES, SAMPLE_PHOTOS, samplePath } from "@/lib/data/seed";
import type { DealDocument } from "@/lib/deal/types";
import { getFile, putFile } from "@/lib/store/files";
import { useDemoStore, type DemoDraft } from "@/lib/store/demoStore";
import { TOO_LARGE_MESSAGE, fileKind, isTooLarge, planAdditions } from "./model";

/** Readings running at once (plan Task 15: "up to 5 in parallel"). */
const MAX_PARALLEL = 5;
/** The route answers within its 60 s limit; give up a little later. */
const CLIENT_TIMEOUT_MS = 75_000;

const NETWORK_MESSAGE = "The document could not be sent. Check the connection and try again.";
const TIMEOUT_MESSAGE = "The AI took too long to read this document. Try again.";
const INTERRUPTED_MESSAGE = "The upload was interrupted. Add the file again.";

type Job = { docId: string; file: Blob; fileName: string };

/** Documents queued or being read in this page session. */
const inFlight = new Set<string>();
const queue: Job[] = [];
let running = 0;

/** A short random id for an uploaded file; called from event handlers only (never while rendering). */
export function newFileId(prefix: "doc" | "photo"): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}-${random}`;
}

function currentDraft(): DemoDraft | null {
  return useDemoStore.getState().draft;
}

function hasDocument(docId: string): boolean {
  return currentDraft()?.documents.some((d) => d.id === docId) ?? false;
}

/** Patches one document of the current draft, if it is still there. */
function patchDocument(docId: string, patch: Partial<DealDocument>, extraction?: DemoDraft["extractions"][string] | null) {
  const draft = currentDraft();
  if (!draft || !draft.documents.some((d) => d.id === docId)) return;
  const documents = draft.documents.map((d) => (d.id === docId ? { ...d, ...patch } : d));
  if (extraction === undefined) {
    useDemoStore.getState().updateDraft({ documents });
    return;
  }
  const extractions = { ...draft.extractions };
  if (extraction === null) delete extractions[docId];
  else extractions[docId] = extraction;
  useDemoStore.getState().updateDraft({ documents, extractions });
}

function fail(docId: string, message: string): void {
  patchDocument(
    docId,
    { status: "failed", type: "unknown", extractionSource: null, durationMs: null, error: message },
    null,
  );
}

type Outcome = Extract<ExtractResponse, { ok: true }> | { ok: false; message: string };

async function postExtract(job: Job): Promise<Outcome> {
  const form = new FormData();
  form.append("file", job.file, job.fileName);
  form.append("code", useDemoStore.getState().accessCode ?? "");
  let response: Response;
  try {
    response = await fetch("/api/extract", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return { ok: false, message: timedOut ? TIMEOUT_MESSAGE : NETWORK_MESSAGE };
  }
  // The route answers JSON whatever the status; a platform error page (e.g. Vercel's 413 for bodies over 4.5 MB) is not.
  const body = (await response.json().catch(() => null)) as ExtractResponse | null;
  if (body && typeof body === "object" && "ok" in body) return body.ok ? body : { ok: false, message: body.message };
  if (response.status === 413) return { ok: false, message: "This PDF is too large to upload here." };
  return { ok: false, message: "The document could not be read. Try again." };
}

async function run(job: Job): Promise<void> {
  patchDocument(job.docId, { status: "reading", error: null });
  const outcome = await postExtract(job);
  if (!hasDocument(job.docId)) return;
  if (!outcome.ok) {
    fail(job.docId, outcome.message);
    return;
  }
  const twin = currentDraft()?.documents.find(
    (d) => d.id !== job.docId && d.status === "done" && d.sha256 === outcome.sha256,
  );
  if (twin) {
    fail(job.docId, `The same document is already in this request (${twin.fileName}).`);
    return;
  }
  patchDocument(
    job.docId,
    {
      sha256: outcome.sha256,
      pages: outcome.pages,
      type: outcome.result.documentType,
      status: "done",
      extractionSource: outcome.source,
      durationMs: outcome.durationMs,
      error: null,
    },
    { result: outcome.result, verified: outcome.verified },
  );
}

function pump(): void {
  while (running < MAX_PARALLEL && queue.length > 0) {
    const job = queue.shift()!;
    if (!hasDocument(job.docId)) {
      inFlight.delete(job.docId);
      continue;
    }
    running += 1;
    run(job)
      .catch((error: unknown) => {
        console.error("[wizard] Reading a document failed:", error);
        fail(job.docId, "The document could not be read. Try again.");
      })
      .finally(() => {
        running -= 1;
        inFlight.delete(job.docId);
        pump();
      });
  }
}

/** Queues a document of the draft for reading (once). */
export function readDocument(docId: string, file: Blob, fileName: string): void {
  if (inFlight.has(docId)) return;
  inFlight.add(docId);
  queue.push({ docId, file, fileName });
  pump();
}

/** Reads a failed document again from its stored copy (its row offers "Try again"). */
export async function retryDocument(docId: string): Promise<void> {
  const doc = currentDraft()?.documents.find((d) => d.id === docId);
  if (!doc || inFlight.has(docId)) return;
  const file = await getFile(docId);
  if (!file) {
    fail(docId, INTERRUPTED_MESSAGE);
    return;
  }
  patchDocument(docId, { status: "pending", error: null });
  readDocument(docId, file, doc.fileName);
}

/** After a reload: restarts the documents the draft shows as waiting or being read. */
export function resumeReading(): void {
  const draft = currentDraft();
  if (!draft) return;
  for (const doc of draft.documents) {
    if ((doc.status !== "pending" && doc.status !== "reading") || inFlight.has(doc.id)) continue;
    void getFile(doc.id).then((file) => {
      const now = currentDraft()?.documents.find((d) => d.id === doc.id);
      if (!now || (now.status !== "pending" && now.status !== "reading") || inFlight.has(doc.id)) return;
      if (file) readDocument(doc.id, file, doc.fileName);
      else fail(doc.id, INTERRUPTED_MESSAGE);
    });
  }
}

export function removeDocument(docId: string): void {
  const draft = currentDraft();
  if (!draft) return;
  const extractions = { ...draft.extractions };
  delete extractions[docId];
  useDemoStore.getState().updateDraft({ documents: draft.documents.filter((d) => d.id !== docId), extractions });
}

export function removePhoto(photoId: string): void {
  const draft = currentDraft();
  if (!draft) return;
  useDemoStore.getState().updateDraft({
    photos: draft.photos.filter((p) => p.id !== photoId),
    units: draft.units?.map((u) => ({ ...u, photoIds: u.photoIds.filter((id) => id !== photoId) })) ?? null,
  });
}

function emptyDocument(id: string, fileName: string): DealDocument {
  return {
    id,
    fileName,
    sha256: "",
    pages: 0,
    type: "unknown",
    status: "pending",
    extractionSource: null,
    durationMs: null,
    findings: [],
    uncertainFields: [],
    error: null,
  };
}

/**
 * Adds dropped or chosen files to the draft: PDFs become document rows and are read, photos are kept (in IndexedDB)
 * and, with `photoUnits`, assigned to a unit by file name. A PDF over 5 MB is refused in the browser, before any upload.
 * Returns what was skipped and why, or null.
 */
export function addFiles(files: File[], photoUnits: Record<string, string | null> = {}): string | null {
  const store = useDemoStore.getState();
  if (!store.draft) store.startDraft();
  const draft = currentDraft()!;
  const plan = planAdditions(draft, files);

  const documents = plan.pdfs.map((file) => {
    const doc = emptyDocument(newFileId("doc"), file.name);
    return isTooLarge(file) ? { ...doc, status: "failed" as const, error: TOO_LARGE_MESSAGE } : doc;
  });
  const photos = plan.photos.map((file) => ({
    id: newFileId("photo"),
    fileName: file.name,
    unitId: photoUnits[file.name] ?? null,
  }));

  const extractions = { ...draft.extractions };
  for (const id of plan.replaceDocumentIds) delete extractions[id];
  const units =
    draft.units?.map((u) => ({
      ...u,
      photoIds: [...u.photoIds, ...photos.filter((p) => p.unitId === u.id).map((p) => p.id)],
    })) ?? null;
  store.updateDraft({
    documents: [...draft.documents.filter((d) => !plan.replaceDocumentIds.includes(d.id)), ...documents],
    extractions,
    photos: [...draft.photos, ...photos],
    units,
  });

  photos.forEach((photo, i) => void putFile(photo.id, plan.photos[i]));
  documents.forEach((doc, i) => {
    if (doc.status === "failed") return;
    const file = plan.pdfs[i];
    void putFile(doc.id, file);
    readDocument(doc.id, file, file.name);
  });
  return plan.notice;
}

/** Adds photos to one unit (the unit table's photo slot); other files are skipped. */
export function addUnitPhotos(unitId: string, files: File[]): string | null {
  const photos = files.filter((f) => fileKind(f) === "photo");
  const skipped = files.filter((f) => fileKind(f) !== "photo").map((f) => f.name);
  const notes = [
    skipped.length > 0 && `Skipped ${skipped.join(", ")}: only photos (JPEG, PNG or WebP) can be added to a unit.`,
    photos.length > 0 && addFiles(photos, Object.fromEntries(photos.map((f) => [f.name, unitId]))),
  ].filter((n): n is string => typeof n === "string" && n !== "");
  return notes.length > 0 ? notes.join(" ") : null;
}

/** The bundled sample files: the 5 PDFs and the 3 photos (the attic's two assigned to its unit, u8). */
const SAMPLE_FILES: { fileName: string; type: string }[] = [
  ...SAMPLE_DOCUMENT_FILES.map((f) => ({ fileName: f.fileName, type: "application/pdf" })),
  ...SAMPLE_PHOTOS.map((p) => ({ fileName: p.fileName, type: "image/jpeg" })),
];

export const SAMPLE_DOWNLOADS = SAMPLE_FILES.map((f) => ({ fileName: f.fileName, href: samplePath(f.fileName) }));

/**
 * "Use sample documents": fetches the bundled files and adds them as if dropped. Files already in the request are
 * skipped. Rejects when the files cannot be fetched.
 */
export async function addSampleFiles(): Promise<string | null> {
  const draft = currentDraft();
  const present = new Set([
    ...(draft?.documents.filter((d) => d.status !== "failed").map((d) => d.fileName) ?? []),
    ...(draft?.photos.map((p) => p.fileName) ?? []),
  ]);
  const wanted = SAMPLE_FILES.filter((f) => !present.has(f.fileName));
  if (wanted.length === 0) return "The sample documents are already in this request.";
  const files = await Promise.all(
    wanted.map(async ({ fileName, type }) => {
      const response = await fetch(samplePath(fileName));
      if (!response.ok) throw new Error(`${fileName}: HTTP ${response.status}`);
      return new File([await response.blob()], fileName, { type });
    }),
  );
  return addFiles(files, Object.fromEntries(SAMPLE_PHOTOS.map((p) => [p.fileName, p.unitId])));
}
