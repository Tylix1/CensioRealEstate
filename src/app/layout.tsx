import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { DemoBar } from "@/components/demo/DemoBar";
import { OrientationOverlay } from "@/components/demo/OrientationOverlay";
import { RECORDING_SCRIPT } from "@/components/demo/recording";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Censio RE — AI-native property valuation (prototype)",
  description: "Clickable prototype with sample data: AI reads the documents, a senior valuer checks the judgement calls.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the inline script may mark <html> for recording mode before React hydrates.
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Hides the demo bar before the first paint when the tab is in recording mode (?recording=1). */}
        <script dangerouslySetInnerHTML={{ __html: RECORDING_SCRIPT }} />
      </head>
      <body className="min-h-full bg-page text-ink">
        <DemoBar />
        {children}
        <OrientationOverlay />
      </body>
    </html>
  );
}
