import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { THEME_SCRIPT } from "@/components/themeScript";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION = "Build a workflow by connecting blocks, then press Run and watch each step execute with its real data.";

// On Vercel this is the site's public address, which link previews need.
const SITE = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3020";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Flowboard: a visual workflow builder", template: "%s · Flowboard" },
  description: DESCRIPTION,
  openGraph: { title: "Flowboard: a visual workflow builder", description: DESCRIPTION, type: "website", siteName: "Flowboard" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The script below sets data-theme before React loads, so the attribute
    // differs from what the server sent. That is expected.
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
