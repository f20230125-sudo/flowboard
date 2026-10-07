import type { NextConfig } from "next";

// What every page and route is sent with. It says what a page may not be: shown
// inside another site's frame, given a different base address by an injected
// tag, or made to embed a plug-in or send a form to another site. It does not
// limit which sites a page may load from or send to, because an HTTP block
// calls whatever address a flow names, and a fixed list would break flows.
//
// Cross-Origin-Opener-Policy is left alone on purpose: "Open in Hindsight"
// opens another page and has to hear back from it, and that policy would cut
// the tie.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  // The same, for browsers that read the older header.
  { key: "X-Frame-Options", value: "DENY" },
  // A file is what its type says it is, and is never guessed to be a script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // Development only: lets the dev server be opened as 127.0.0.1 as well as localhost.
  allowedDevOrigins: ["127.0.0.1"],
  // The Docker build asks for a self-contained server (see Dockerfile). Other
  // builds, such as the one on Vercel, are left as they are.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
