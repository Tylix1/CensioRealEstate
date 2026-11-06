/**
 * Recording mode (spec §5.1, "my call"): `?recording=1` in any URL hides the demo chrome (demo bar and the automatic
 * orientation overlay) for clean video takes, `?recording=0` shows it again. The flag lives in sessionStorage, so it
 * holds for the whole tab session.
 *
 * Before the first paint, RECORDING_SCRIPT (inlined into <head> by the root layout) sets `data-recording` on <html>
 * and CSS hides the demo bar, so it never flashes. After hydration, `useRecordingMode()` (./recordingMode.ts) takes
 * over and the bar is not rendered at all.
 *
 * Plain constants without React, so the root layout (a Server Component) can import the script text.
 */

export const RECORDING_STORAGE_KEY = "censio-recording";

/** The attribute on <html> that marks recording mode before React runs. */
export const RECORDING_ATTRIBUTE = "data-recording";

/** Runs synchronously while the browser parses <head>. Fails soft where sessionStorage is unavailable. */
export const RECORDING_SCRIPT = `(function(){try{var k=${JSON.stringify(RECORDING_STORAGE_KEY)};var p=new URLSearchParams(location.search).get("recording");if(p==="1")sessionStorage.setItem(k,"1");else if(p==="0")sessionStorage.removeItem(k);if(sessionStorage.getItem(k)==="1")document.documentElement.setAttribute(${JSON.stringify(RECORDING_ATTRIBUTE)},"")}catch(e){}})()`;
