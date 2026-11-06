"use client";

/**
 * V2 · Preview report draft: the senior valuer's view of the report, under the valuer's app bar, so previewing does
 * not switch the demo to the client. An unsigned deal shows the draft with a "Draft — not signed" banner (its PDF
 * carries a draft watermark); a signed one, the report as sent. The body is `ReportScreen`, shared with the client's
 * C5 page.
 *
 * `ReportScreen` reads the id from the URL (`useParams()`), runtime URL data with Cache Components, so it renders
 * inside a Suspense boundary.
 */
import { Suspense } from "react";
import { ReportPlaceholder, ReportScreen } from "@/components/report/ReportScreen";
import { ValuerAppBar } from "@/components/valuer/QueueRail";

export default function ValuerReportPage() {
  return (
    <>
      <ValuerAppBar />
      <main className="mx-auto max-w-[1100px] px-4 pb-12 pt-5 sm:px-6">
        <Suspense fallback={<ReportPlaceholder />}>
          <ReportScreen audience="valuer" />
        </Suspense>
      </main>
    </>
  );
}
