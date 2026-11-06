/**
 * The demo's client state (spec §7): the signed-in role, the access code, the deals with their revision history and
 * review status, and the wizard's draft. A zustand store persisted to localStorage under "censio-demo-v1", so the
 * state survives a reload; uploaded files live in IndexedDB (files.ts). Reset demo restores the seeded state and
 * clears the files.
 *
 * Server rendering. Next.js renders client components on the server first, where there is no localStorage: there the
 * store keeps the seeded state and never touches storage. In the browser it reads localStorage when the module loads,
 * before React hydrates. zustand's hooks still render the seeded state while React hydrates (their server snapshot),
 * so the HTML matches, and switch to the saved state right after. Pages that show saved data render a placeholder
 * until `useDemoHydrated()` is true, so they neither mismatch nor flash the seeded state.
 *
 * Derived figures are not stored: `currentPipeline(stored)` recomputes a deal's current version (memoise it).
 *
 * Time stamps (`new Date()`) are taken in actions only, never while the module loads or renders: with Cache
 * Components, Next.js aborts a prerender that reads the clock.
 */
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { SAMPLE_SKELETON, SEED_DEAL_ID, seededDeal } from "@/lib/data/seed";
import { dealFromExtractions, type DealSkeleton } from "@/lib/deal/fromExtraction";
import type { Deal, DealDocument, Unit } from "@/lib/deal/types";
import type { ExtractionResult } from "@/lib/extraction/schemas";
import {
  buildRunLog,
  flagsChangedByValuer,
  runCurrentVersion,
  runPipeline,
  type PipelineOutput,
} from "@/lib/pipeline/run";
import { currentVersion, initialHistory, type History } from "@/lib/revisions/history";
import { clearFiles } from "@/lib/store/files";

/** The localStorage key. */
export const DEMO_STORE_KEY = "censio-demo-v1";

/** Bump when the stored shape changes: a saved state of another version is discarded for the seeded one. */
const STORE_VERSION = 1;

/** The senior valuer who signs (plan "Sample world"). */
export const SIGNER = "K. Vogel" as const;

/** The draft's deal id until it is submitted. */
const DRAFT_DEAL_ID = "draft";

/** Deals submitted after the first one are numbered from here (the static queue rows end at 0153). */
const FIRST_LATER_DEAL_NUMBER = 154;

export interface StoredDeal {
  deal: Deal;
  history: History;
  /** Review status by flag id; a flag missing here (e.g. one a revision raised) is open. */
  flagStatus: Record<string, "open" | "accepted">;
  /** The flags the valuer focused, in the order first opened. */
  openedFlags: string[];
  spotCheck: "open" | "matches";
  approval: { at: string; version: number; signer: "K. Vogel"; acceptedAtSignOff: string[] } | null;
}

/** The wizard's work in progress (C3.1–C3.4). */
export interface DemoDraft {
  skeleton: DealSkeleton;
  documents: DealDocument[];
  /** By document id: the extraction route's result and quote check. */
  extractions: Record<string, { result: ExtractionResult; verified: Record<string, boolean> }>;
  /** The units of step C3.3 with the client's edits; null until that step starts from the tenant list. */
  units: Unit[] | null;
  step: 1 | 2 | 3 | 4;
  /** Photos added in the wizard; their files live in IndexedDB under their ids. */
  photos: Deal["photos"];
}

export interface DemoState {
  role: "client" | "valuer" | null;
  accessCode: string | null;
  orientationSeen: boolean;
  deals: Record<string, StoredDeal>;
  draft: DemoDraft | null;
  /** Deals submitted since the last reset: the first takes CEN-2026-0147, later ones 0154, 0155, … */
  submittedCount: number;
  signIn(role: "client" | "valuer"): void;
  setRole(role: "client" | "valuer"): void;
  /** Trimmed; an empty code is null. */
  setAccessCode(code: string | null): void;
  dismissOrientation(): void;
  /** A new draft on the sample address (C3.1 is prefilled with it). */
  startDraft(): void;
  /** Patches the draft, starting one first if there is none. */
  updateDraft(patch: Partial<NonNullable<DemoState["draft"]>>): void;
  /**
   * Stores the deal for review and closes the draft; returns the deal's id. The deal (e.g. `dealFromDraft(draft)`)
   * gets its id, the request time and status `in_review`; the pipeline then runs for its run log (steps after the
   * documents) and the AI draft v1. The first deal since the last reset replaces the seeded CEN-2026-0147.
   */
  submitDraft(deal: Deal): string;
  setHistory(dealId: string, h: History): void;
  setFlagStatus(dealId: string, flagId: string, s: "open" | "accepted"): void;
  markOpened(dealId: string, flagId: string): void;
  setSpotCheck(dealId: string, s: "open" | "matches"): void;
  /**
   * Signs the current version and sets the deal `approved` (spec §5.2 V4). Of the calls not accepted yet, the ones
   * never opened are accepted and logged in `acceptedAtSignOff` ("accepted at sign-off without opening"). With
   * `acceptRemaining`, every other open call is accepted too; without it, opened calls stay open. A call the valuer
   * changed in a revision is never logged (it reads "changed by valuer", see `flagReviewStatuses`). A deal is signed
   * once: on an approved deal (e.g. a double click on Sign & send) it does nothing, so the first sign-off log stays.
   */
  approve(dealId: string, acceptRemaining: boolean): void;
  /** Restores the seeded state (role, deals, draft) and clears IndexedDB; the access code and orientation stay. */
  reset(): Promise<void>;
}

type DemoData = Pick<DemoState, "role" | "accessCode" | "orientationSeen" | "deals" | "draft" | "submittedCount">;

// ---------------------------------------------------------------------------------------------------------------------
// Pure helpers for the UI

/** The pipeline of the deal's current version (figures, flags, registry, cross-checks); memoise it per stored deal. */
export function currentPipeline(stored: StoredDeal): PipelineOutput {
  return runCurrentVersion(stored.deal, stored.history);
}

export type FlagReviewStatus = "changed_by_valuer" | "accepted" | "open";

/**
 * The review status of each flag of `out` (the current version): changed by the valuer in an active revision, else
 * accepted, else open. "x of n reviewed" counts the flags that are not open.
 */
export function flagReviewStatuses(stored: StoredDeal, out: PipelineOutput): Record<string, FlagReviewStatus> {
  const changed = new Set(flagsChangedByValuer(out, stored.history));
  return Object.fromEntries(
    out.flags.map((f): [string, FlagReviewStatus] => [
      f.id,
      changed.has(f.id) ? "changed_by_valuer" : stored.flagStatus[f.id] === "accepted" ? "accepted" : "open",
    ]),
  );
}

/**
 * The deal the wizard submits: `dealFromExtractions` over the draft's read documents, with the draft's units (the
 * client's edits and units added by hand) and photos. Documents without an extraction (failed, or a file Live AI is
 * needed for) keep their row, in upload order.
 */
export function dealFromDraft(draft: DemoDraft): Deal {
  const read = draft.documents.flatMap((doc) => {
    const extraction = draft.extractions[doc.id];
    return extraction ? [{ doc, result: extraction.result, verified: extraction.verified }] : [];
  });
  const extracted = dealFromExtractions(draft.skeleton, read);
  const built = new Map(extracted.documents.map((d) => [d.id, d]));
  return {
    ...extracted,
    documents: draft.documents.map((d) => built.get(d.id) ?? structuredClone(d)),
    units: draft.units ? structuredClone(draft.units) : extracted.units,
    photos: structuredClone(draft.photos ?? []),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// State

function storedDealFor(deal: Deal, createdAt: string, out: PipelineOutput = runPipeline(deal)): StoredDeal {
  return {
    deal,
    history: initialHistory(out.params, createdAt),
    flagStatus: Object.fromEntries(out.flags.map((f) => [f.id, "open" as const])),
    openedFlags: [],
    spotCheck: "open",
    approval: null,
  };
}

/** What Reset demo restores: the seeded deal, ready in the valuer queue, and nobody signed in. */
function seededData(): Pick<DemoData, "role" | "deals" | "draft" | "submittedCount"> {
  const deal = seededDeal();
  // v1's time stamp is the request time, so the seeded state is the same on the server and in the browser.
  return { role: null, deals: { [deal.id]: storedDealFor(deal, deal.requestedAt) }, draft: null, submittedCount: 0 };
}

function newDraft(): DemoDraft {
  return {
    skeleton: {
      ...SAMPLE_SKELETON,
      address: { ...SAMPLE_SKELETON.address },
      id: DRAFT_DEAL_ID,
      requestedAt: new Date().toISOString(),
    },
    documents: [],
    extractions: {},
    units: null,
    step: 1,
    photos: [],
  };
}

function dealIdFor(submitted: number): string {
  if (submitted === 0) return SEED_DEAL_ID;
  return `CEN-2026-${String(FIRST_LATER_DEAL_NUMBER - 1 + submitted).padStart(4, "0")}`;
}

function approved(stored: StoredDeal, acceptRemaining: boolean, at: string): StoredDeal {
  const out = currentPipeline(stored);
  const changed = new Set(flagsChangedByValuer(out, stored.history));
  const flagStatus = { ...stored.flagStatus };
  const acceptedAtSignOff: string[] = [];
  for (const flag of out.flags) {
    if (flagStatus[flag.id] === "accepted") continue;
    if (changed.has(flag.id)) {
      // Settled by a revision, so never "accepted without opening".
      if (acceptRemaining) flagStatus[flag.id] = "accepted";
      continue;
    }
    if (!stored.openedFlags.includes(flag.id)) {
      flagStatus[flag.id] = "accepted";
      acceptedAtSignOff.push(flag.id);
    } else if (acceptRemaining) {
      flagStatus[flag.id] = "accepted";
    }
  }
  return {
    ...stored,
    deal: { ...stored.deal, status: "approved" },
    flagStatus,
    approval: { at, version: currentVersion(stored.history).n, signer: SIGNER, acceptedAtSignOff },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Persistence

/** On the server there is no browser state: rendering never reads or writes it. */
const SERVER_STORAGE: StateStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

/** localStorage, failing soft: an unreadable entry reads as none, and a refused write keeps the state in memory. */
function demoStorage(): StateStorage {
  if (typeof window === "undefined") return SERVER_STORAGE;
  return {
    getItem: (name) => {
      try {
        const raw = window.localStorage.getItem(name);
        if (raw !== null) JSON.parse(raw);
        return raw;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        window.localStorage.setItem(name, value);
      } catch (error) {
        console.warn("[demo store] The demo state could not be saved; it is kept until the next reload.", error);
      }
    },
    removeItem: (name) => {
      try {
        window.localStorage.removeItem(name);
      } catch {
        // Nothing to remove where storage is unavailable.
      }
    },
  };
}

function persistedPart(s: DemoState): DemoData {
  return {
    role: s.role,
    accessCode: s.accessCode,
    orientationSeen: s.orientationSeen,
    deals: s.deals,
    draft: s.draft,
    submittedCount: s.submittedCount,
  };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** A saved deal the UI can work with: a deal and a history with at least one version. */
function isStoredDeal(x: unknown): x is StoredDeal {
  return (
    isRecord(x) &&
    isRecord(x.deal) &&
    isRecord(x.history) &&
    Array.isArray(x.history.versions) &&
    x.history.versions.length > 0 &&
    isRecord(x.flagStatus) &&
    Array.isArray(x.openedFlags)
  );
}

/** Takes the saved state over the seeded one, field by field; anything malformed keeps the seeded value. */
function mergeSaved(saved: unknown, current: DemoState): DemoState {
  if (!isRecord(saved)) return current;
  const deals = isRecord(saved.deals)
    ? Object.fromEntries(Object.entries(saved.deals).filter(([, stored]) => isStoredDeal(stored)))
    : {};
  const count = saved.submittedCount;
  return {
    ...current,
    role: saved.role === "client" || saved.role === "valuer" ? saved.role : null,
    accessCode: typeof saved.accessCode === "string" && saved.accessCode !== "" ? saved.accessCode : null,
    orientationSeen: saved.orientationSeen === true,
    deals: Object.keys(deals).length > 0 ? (deals as Record<string, StoredDeal>) : current.deals,
    draft: isRecord(saved.draft)
      ? ({ ...saved.draft, photos: Array.isArray(saved.draft.photos) ? saved.draft.photos : [] } as unknown as DemoDraft)
      : null,
    submittedCount: typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The store

export const useDemoStore = create<DemoState>()(
  persist(
    (set, get) => {
      /** Replaces a deal the store holds with `update(stored)`; ignores unknown ids and unchanged deals. */
      const updateDeal = (dealId: string, update: (stored: StoredDeal) => StoredDeal): void => {
        const stored = get().deals[dealId];
        if (!stored) return;
        const next = update(stored);
        if (next !== stored) set((s) => ({ deals: { ...s.deals, [dealId]: next } }));
      };

      return {
        ...seededData(),
        accessCode: null,
        orientationSeen: false,

        signIn: (role) => set({ role }),
        setRole: (role) => set({ role }),
        setAccessCode: (code) => set({ accessCode: code?.trim() || null }),
        dismissOrientation: () => set({ orientationSeen: true }),

        startDraft: () => set({ draft: newDraft() }),
        updateDraft: (patch) => set((s) => ({ draft: { ...(s.draft ?? newDraft()), ...patch } })),
        submitDraft: (deal) => {
          const submitted = get().submittedCount;
          const id = dealIdFor(submitted);
          const requestedAt = new Date().toISOString();
          const forReview: Deal = { ...structuredClone(deal), id, requestedAt, status: "in_review", runLog: [] };
          const out = runPipeline(forReview);
          const logged: Deal = { ...forReview, runLog: buildRunLog(forReview, out) };
          set((s) => ({
            deals: { ...s.deals, [id]: storedDealFor(logged, requestedAt, out) },
            draft: null,
            submittedCount: submitted + 1,
          }));
          return id;
        },

        setHistory: (dealId, h) => updateDeal(dealId, (stored) => ({ ...stored, history: h })),
        setFlagStatus: (dealId, flagId, status) =>
          updateDeal(dealId, (stored) => ({ ...stored, flagStatus: { ...stored.flagStatus, [flagId]: status } })),
        markOpened: (dealId, flagId) =>
          updateDeal(dealId, (stored) =>
            stored.openedFlags.includes(flagId) ? stored : { ...stored, openedFlags: [...stored.openedFlags, flagId] },
          ),
        setSpotCheck: (dealId, status) => updateDeal(dealId, (stored) => ({ ...stored, spotCheck: status })),
        approve: (dealId, acceptRemaining) =>
          updateDeal(dealId, (stored) =>
            // Signing again would log no call as accepted at sign-off and so erase the first sign-off's log.
            stored.approval ? stored : approved(stored, acceptRemaining, new Date().toISOString()),
          ),

        reset: async () => {
          set(seededData());
          await clearFiles();
        },
      };
    },
    {
      name: DEMO_STORE_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage<DemoData>(demoStorage),
      partialize: persistedPart,
      merge: mergeSaved,
      // A state saved by another version of the app is dropped for the seeded one.
      migrate: () => ({}) as DemoData,
    },
  ),
);

// ---------------------------------------------------------------------------------------------------------------------
// Hydration

function subscribeToHydration(onChange: () => void): () => void {
  const stopStart = useDemoStore.persist.onHydrate(onChange);
  const stopFinish = useDemoStore.persist.onFinishHydration(onChange);
  return () => {
    stopStart();
    stopFinish();
  };
}

const hydratedInBrowser = (): boolean => useDemoStore.persist.hasHydrated();
const hydratedOnServer = (): boolean => false;

/**
 * Whether the saved state is in place. false on the server and while React hydrates, true right after; on a
 * client-side navigation it is true from the first render. Pages that show saved data render a placeholder until then.
 */
export function useDemoHydrated(): boolean {
  return useSyncExternalStore(subscribeToHydration, hydratedInBrowser, hydratedOnServer);
}
