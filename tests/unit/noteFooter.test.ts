/**
 * The footer under a Revalue note box (src/components/valuer/RevalueNoteFooter.tsx): the example notes are offered in
 * Demo mode and with Live AI, so the rehearsed note of the video take (README, "Recording the video") can be clicked in
 * either mode; Live AI then reads it.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RevalueNoteFooter } from "@/components/valuer/RevalueNoteFooter";
import { DEMO_EXAMPLE_NOTES } from "@/components/valuer/revision";

function footer(examples: "demo" | "live" | null): string {
  return renderToStaticMarkup(
    createElement(RevalueNoteFooter, { answerId: "answer", answer: undefined, examples, onPickExample: () => {}, busy: false }),
  );
}

describe("the example notes under a Revalue note box", () => {
  it("offers the rehearsed note in Demo mode and with Live AI", () => {
    const rehearsed = DEMO_EXAMPLE_NOTES.find((note) => note.endsWith("Use 3.4 %."));
    expect(rehearsed).toBeDefined();
    const demo = footer("demo");
    const live = footer("live");
    expect(demo).toContain("demo mode, click one to fill in the note");
    expect(live).toContain("click one to fill in the note, or write your own");
    expect(live).not.toContain("demo mode");
    for (const html of [demo, live]) {
      for (const note of DEMO_EXAMPLE_NOTES) expect(html).toContain(note.replace(/&/g, "&amp;"));
    }
  });

  it("shows nothing until the mode is known", () => {
    expect(footer(null)).toBe("");
  });
});
