import type { Metadata } from "next";
import { Hanken_Grotesk, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Hanken Grotesk: the closest free match to PostHog's proprietary UI font
// (RoundHog, ex-MatterSQ) - a warm geometric-grotesque with a generous
// x-height. Loaded as a variable font; the body renders at weight 450
// (globals.css) because Google's 400 cuts read thinner than the boutique
// grotesques this look is borrowed from.
const hankenSans = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dispatchseo.com"),
  title: "DispatchSEO",
  description: "Automate your SEO with Claude Code - keywords, rankings, backlinks and automations, tracked daily",
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${hankenSans.variable} ${geistMono.variable}`}>
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
