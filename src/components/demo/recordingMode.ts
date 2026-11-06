/**
 * Recording mode in React (see ./recording.ts). Uses React hooks and has no 'use client': import it only from client
 * components.
 */
import { useSyncExternalStore } from "react";
import { RECORDING_ATTRIBUTE, RECORDING_STORAGE_KEY } from "./recording";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readRecording(): boolean {
  try {
    return window.sessionStorage.getItem(RECORDING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Turns recording mode on or off for this tab (e.g. from `?recording=` on a client-side navigation). */
export function setRecordingMode(on: boolean): void {
  try {
    if (on) window.sessionStorage.setItem(RECORDING_STORAGE_KEY, "1");
    else window.sessionStorage.removeItem(RECORDING_STORAGE_KEY);
  } catch {
    // Without sessionStorage the flag only lasts until the next reload.
  }
  document.documentElement.toggleAttribute(RECORDING_ATTRIBUTE, on);
  listeners.forEach((listener) => listener());
}

/** Whether the demo chrome is hidden. false on the server and while React hydrates, so the HTML always matches. */
export function useRecordingMode(): boolean {
  return useSyncExternalStore(subscribe, readRecording, () => false);
}
