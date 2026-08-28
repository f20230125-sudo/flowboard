import type { Metadata, Viewport } from "next";
import { Sono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { THEME_SCRIPT } from "@/components/themeScript";
import "./globals.css";

// One file, two voices: the MONO axis. Flowboard's own words are the
// proportional voice, names and data are the mono voice (see globals.css).
const sono = Sono({
  variable: "--font-sono",
  subsets: ["latin"],
  axes: ["MONO"],
  display: "swap",
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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e5eaea" },
    { media: "(prefers-color-scheme: dark)", color: "#131a1b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The script below sets data-theme before React loads, so the attribute
    // differs from what the server sent. That is expected.
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${sono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="skip-link">
          Skip to the content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
