/**
 * Browser frame for video takes: `?frame=1` in any URL draws a browser toolbar with the page's address above the
 * product UI, `?frame=0` removes it. A take filmed without the browser's own chrome (a headless or cloud capture)
 * then still shows where the prototype lives, and because the toolbar is part of the page, a zoom or a crop in the
 * edit treats it like the real one. The flag lives in sessionStorage, so it holds for the whole tab session.
 * Combine it with `?recording=1` (./recording.ts) to also hide the demo bar: `/?recording=1&frame=1`.
 *
 * Before the first paint, FRAME_SCRIPT (inlined into <head> by the root layout) sets `data-frame` on <html>; the
 * toolbar (./BrowserFrame.tsx) is always in the HTML and CSS shows it only under that attribute, so it never flashes.
 *
 * Plain constants without React, so the root layout (a Server Component) can import the script text.
 */

export const FRAME_STORAGE_KEY = "censio-frame";

/** The attribute on <html> that turns the browser frame on. */
export const FRAME_ATTRIBUTE = "data-frame";

/** Runs synchronously while the browser parses <head>. Fails soft where sessionStorage is unavailable. */
export const FRAME_SCRIPT = `(function(){try{var k=${JSON.stringify(FRAME_STORAGE_KEY)};var p=new URLSearchParams(location.search).get("frame");if(p==="1")sessionStorage.setItem(k,"1");else if(p==="0")sessionStorage.removeItem(k);if(sessionStorage.getItem(k)==="1")document.documentElement.setAttribute(${JSON.stringify(FRAME_ATTRIBUTE)},"")}catch(e){}})()`;

/** Turns the browser frame on or off for this tab (e.g. from `?frame=` on a client-side navigation). */
export function setFrameMode(on: boolean): void {
  try {
    if (on) window.sessionStorage.setItem(FRAME_STORAGE_KEY, "1");
    else window.sessionStorage.removeItem(FRAME_STORAGE_KEY);
  } catch {
    // Without sessionStorage the flag only lasts until the next reload.
  }
  document.documentElement.toggleAttribute(FRAME_ATTRIBUTE, on);
}
