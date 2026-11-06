"use client";

/**
 * A photo the client added, shown from its copy in IndexedDB. Photos are stored and shown, never sent to the AI
 * (spec §6.1).
 */
import { useEffect, useState } from "react";
import { cx } from "@/components/ui/cx";
import { getFile } from "@/lib/store/files";

function usePhotoUrl(photoId: string): string | null | undefined {
  const [state, setState] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void getFile(photoId).then((blob) => {
      if (cancelled) return;
      url = blob ? URL.createObjectURL(blob) : null;
      setState({ id: photoId, url });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoId]);
  return state?.id === photoId ? state.url : undefined;
}

/** A square thumbnail; `alt` names the photo. */
export function PhotoThumb({ photoId, alt, size = 48, className }: { photoId: string; alt: string; size?: number; className?: string }) {
  const url = usePhotoUrl(photoId);
  return (
    <span
      className={cx("block shrink-0 overflow-hidden rounded-md border border-line bg-[#EEF2F6]", className)}
      style={{ width: size, height: size }}
    >
      {url ? (
        // A blob URL from IndexedDB: next/image cannot optimise it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} width={size} height={size} className="size-full object-cover" />
      ) : (
        <span role="img" aria-label={url === null ? `${alt} (not stored in this browser)` : alt} className="block size-full" />
      )}
    </span>
  );
}
