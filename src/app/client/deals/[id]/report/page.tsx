"use client";

/**
 * C5 · Report delivered (spec §5.2 and §5.6): the simulated email that delivers the signed report, with **Download
 * PDF**, and the report itself, sections 1–9. The body is `ReportScreen` (src/components/report/ReportScreen.tsx),
 * which the senior valuer's draft preview (/valuer/deals/[id]/report) shares.
 *
 * `ReportScreen` reads the id and the old `?preview=1` flag from the URL (`useParams()`, `useSearchParams()`), runtime
 * URL data with Cache Components, so it renders inside a Suspense boundary.
 */
import { Suspense } from "react";
import { ReportPlaceholder, ReportScreen } from "@/components/report/ReportScreen";
import { AppBar } from "@/components/ui/AppBar";

export default function ReportPage() {
  return (
    <>
      <AppBar persona="client" nav={[{ label: "Valuations", href: "/client", active: true }]} />
      <main className="mx-auto max-w-[1100px] px-4 pb-12 pt-5 sm:px-6">
        <Suspense fallback={<ReportPlaceholder />}>
          <ReportScreen audience="client" />
        </Suspense>
      </main>
    </>
  );
}
