import type { Metadata } from "next";
import { Playfair_Display, Lora } from "next/font/google";
import "./globals.css";
import { PageViewTracker } from "@/components/PageViewTracker";
import { BottomNav } from "@/components/BottomNav";
import { THEME_SCRIPT } from "@/components/ThemeToggle";

// Two serif fonts give the cookbook feel: Playfair for headings, Lora for reading.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

// metadataBase turns relative image URLs into full ones. Link previews need
// full URLs, and on Vercel VERCEL_PROJECT_PRODUCTION_URL is the live domain.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "My Cookbook",
  description: "Save recipes without the ads. Share them with friends.",
  openGraph: { siteName: "Cookbook", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: THEME_SCRIPT may set data-theme before React
    // loads, which React would otherwise report as a mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${playfair.variable} ${lora.variable} antialiased`}>
        <PageViewTracker />
        {/* Bottom padding so the last thing on a page isn't hidden behind the tab bar. */}
        <div className="pb-24">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
