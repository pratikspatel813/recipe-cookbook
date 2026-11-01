import type { Metadata } from "next";
import { Playfair_Display, Lora } from "next/font/google";
import "./globals.css";
import { PageViewTracker } from "@/components/PageViewTracker";

// Two serif fonts give the cookbook feel: Playfair for headings, Lora for reading.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "My Cookbook",
  description: "Save recipes without the ads. Share them with friends.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${playfair.variable} ${lora.variable} antialiased`}>
        <PageViewTracker />
        {children}
      </body>
    </html>
  );
}
