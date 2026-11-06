"use client";

/**
 * C1 · Sign in / Create account (spec §5.2). Visual only: two buttons sign in as the client or as the senior valuer,
 * with no form and no validation.
 */
import { useRouter } from "next/navigation";
import { OrientationSteps } from "@/components/demo/OrientationOverlay";
import { AppBar } from "@/components/ui/AppBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { useDemoStore } from "@/lib/store/demoStore";

export default function SignInPage() {
  const router = useRouter();
  const signIn = useDemoStore((s) => s.signIn);

  const continueAs = (role: "client" | "valuer") => {
    signIn(role);
    router.push(role === "client" ? "/client" : "/valuer");
  };

  return (
    <>
      <AppBar />
      <main className="mx-auto flex max-w-[1440px] flex-wrap items-start justify-between gap-x-16 gap-y-8 px-4 pb-16 pt-8 sm:px-6 lg:pt-16">
        <section aria-labelledby="intro-title" className="min-w-0 max-w-[720px] flex-[1_1_440px]">
          <Pill tone="brand">Prototype · AI-native property valuation</Pill>
          <h1
            id="intro-title"
            className="mt-4 font-display text-[32px] font-semibold leading-10 tracking-[-0.02em] sm:text-[40px] sm:leading-[48px]"
          >
            Valuations the AI prepares and a senior valuer signs.
          </h1>
          <p className="mt-4 max-w-[600px] text-base leading-6 text-ink-2">
            Censio reads the property documents, looks up public data, estimates the market rents and drafts an
            income-approach valuation (Ertragswertverfahren). A senior valuer checks the AI&apos;s judgement calls and
            decides.
          </p>
          <OrientationSteps className="mt-8" />
        </section>

        <Card as="section" aria-labelledby="sign-in-title" className="min-w-0 max-w-[480px] flex-[1_1_340px] p-5 sm:p-6">
          <h2 id="sign-in-title" className="font-display text-[22px] font-semibold leading-7 tracking-[-0.01em]">
            Sign in or create an account
          </h2>
          <p className="mt-1 text-ink-2">
            In this prototype there is no password: choose who you are. Everything you see runs on sample data.
          </p>

          <div className="mt-6 flex flex-col gap-1.5">
            <Button variant="primary" size="lg" onClick={() => continueAs("client")} aria-describedby="client-role">
              Continue as Demo Capital GmbH
            </Button>
            <p id="client-role" className="text-xs leading-[18px] text-muted">
              Client, buy-side: request a valuation and upload the property documents.
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <Button variant="secondary" size="lg" onClick={() => continueAs("valuer")} aria-describedby="valuer-role">
              Continue as Senior Valuer
            </Button>
            <p id="valuer-role" className="text-xs leading-[18px] text-muted">
              K. Vogel: review the AI&apos;s draft, revalue with a note and sign the report.
            </p>
          </div>

          <dl className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-t border-line pt-4 text-xs leading-[18px]">
            <dt className="text-muted">Sample deal</dt>
            <dd className="font-mono text-ink-2">CEN-2026-0147</dd>
            <dt className="text-muted">Property</dt>
            <dd className="text-ink-2">Musterstraße 12, 04109 Leipzig</dd>
            <dt className="text-muted">Valuation date</dt>
            <dd className="text-ink-2">06 Nov 2026</dd>
          </dl>
        </Card>
      </main>
    </>
  );
}
