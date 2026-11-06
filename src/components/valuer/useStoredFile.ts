"use client";

/**
 * The files of a deal for the valuer screens: an upload from IndexedDB (`getFile`), else the bundled sample file of the
 * same name. The seeded deal's documents and photos are not in IndexedDB, so they come from `/sample/…`; a client's own
 * file that is no longer stored (another browser, cleared storage) is "missing".
 */
import { useEffect, useState } from "react";
import { SAMPLE_DOCUMENT_FILES, SAMPLE_PHOTOS, samplePath } from "@/lib/data/seed";
import { getFile } from "@/lib/store/files";

export type StoredFile = { status: "loading" } | { status: "ready"; src: Blob | string } | { status: "missing" };

const LOADING: StoredFile = { status: "loading" };

/** The bundled sample with this file name, e.g. `/sample/foto_fassade.jpg`; null for a file of the client's own. */
export function sampleFallback(fileName: string): string | null {
  const known =
    SAMPLE_DOCUMENT_FILES.some((f) => f.fileName === fileName) || SAMPLE_PHOTOS.some((p) => p.fileName === fileName);
  return known ? samplePath(fileName) : null;
}

/**
 * A document's PDF as `PdfViewer` takes it: the stored Blob (its identity stays stable while `id` does) or the sample's
 * URL. "loading" until IndexedDB answers.
 */
export function useStoredFile(id: string | null, fileName: string | null): StoredFile {
  const key = id === null ? null : `${id}|${fileName ?? ""}`;
  const [found, setFound] = useState<{ key: string; file: StoredFile } | null>(null);

  useEffect(() => {
    if (key === null || id === null) return;
    let live = true;
    void getFile(id).then((blob) => {
      if (!live) return;
      const fallback = fileName ? sampleFallback(fileName) : null;
      const file: StoredFile = blob
        ? { status: "ready", src: blob }
        : fallback
          ? { status: "ready", src: fallback }
          : { status: "missing" };
      setFound({ key, file });
    });
    return () => {
      live = false;
    };
  }, [id, fileName, key]);

  if (key === null) return { status: "missing" };
  return found?.key === key ? found.file : LOADING;
}

/**
 * An image's URL: an object URL for a stored Blob (revoked when it is no longer shown) or the sample's URL. undefined
 * while loading, null when the file is missing.
 */
export function useStoredImageUrl(id: string | null, fileName: string | null): string | null | undefined {
  const file = useStoredFile(id, fileName);
  const blob = file.status === "ready" && typeof file.src !== "string" ? file.src : null;
  const [objectUrl, setObjectUrl] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    // Published from a microtask, not synchronously in the effect.
    let live = true;
    void Promise.resolve().then(() => {
      if (live) setObjectUrl({ blob, url });
    });
    return () => {
      live = false;
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  if (file.status === "loading") return undefined;
  if (file.status === "missing") return null;
  if (typeof file.src === "string") return file.src;
  return objectUrl?.blob === blob ? objectUrl.url : undefined;
}
