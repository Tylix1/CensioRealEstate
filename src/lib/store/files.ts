/**
 * The files uploaded in the demo (PDFs and photos), kept in the browser's IndexedDB under their document or photo id
 * (spec §7). Reset demo clears them.
 *
 * Where IndexedDB is unavailable (on the server, in unit tests under Node) or the browser refuses a file (some private
 * modes, a full quota), the file is kept in memory instead, so the flow still works until the next reload.
 */
import { clear, createStore, get, set, type UseStore } from "idb-keyval";

const DB_NAME = "censio-demo-v1";
const STORE_NAME = "files";

/** Files kept for this session only, where IndexedDB is unavailable or refused them. */
const memory = new Map<string, Blob>();

let idbStore: UseStore | null = null;

/** The IndexedDB object store, opened on first use; null where there is no IndexedDB. */
function filesStore(): UseStore | null {
  if (typeof indexedDB === "undefined") return null;
  idbStore ??= createStore(DB_NAME, STORE_NAME);
  return idbStore;
}

export async function putFile(id: string, blob: Blob): Promise<void> {
  const store = filesStore();
  if (store) {
    try {
      await set(id, blob, store);
      memory.delete(id);
      return;
    } catch (error) {
      console.warn(`[files] IndexedDB refused "${id}"; keeping it in memory for this session.`, error);
    }
  }
  memory.set(id, blob);
}

/** The stored file, or undefined (e.g. after Reset demo, or for the seeded deal, whose files are in /sample). */
export async function getFile(id: string): Promise<Blob | undefined> {
  const kept = memory.get(id);
  if (kept) return kept;
  const store = filesStore();
  if (!store) return undefined;
  try {
    return await get<Blob>(id, store);
  } catch (error) {
    console.warn(`[files] IndexedDB could not read "${id}".`, error);
    return undefined;
  }
}

export async function clearFiles(): Promise<void> {
  memory.clear();
  const store = filesStore();
  if (!store) return;
  try {
    await clear(store);
  } catch (error) {
    console.warn("[files] IndexedDB could not be cleared.", error);
  }
}
