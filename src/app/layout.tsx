import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { QueryProvider } from "@/components/providers/query-provider";
import { HydrationSanitizer } from "@/components/providers/hydration-sanitizer";
import { EthereumErrorSilencer } from "@/components/providers/ethereum-error-silencer";
import { ThirdwebAppProvider } from "@/components/providers/thirdweb-app-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  applicationName: "VoiceHub by Ledger1.ai",
  title: {
    default: "VoiceHub by Ledger1.ai",
    template: "%s • VoiceHub",
  },
  description: "Live AI audio agent with ETH billing on Base - VoiceHub by Ledger1.ai",
  keywords: [
    "VoiceHub by Ledger1.ai",
    "AI",
    "agent",
    "voice",
    "live audio",
    "streaming",
    "spaces",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: APP_URL,
    title: "VoiceHub by Ledger1.ai",
    siteName: "VoiceHub",
    description: "Live AI audio agent with ETH billing on Base - VoiceHub by Ledger1.ai",
    images: [
      {
        url: "https://engram1.blob.core.windows.net/voicehub/l1voicebg.png",
        width: 1200,
        height: 630,
        alt: "VoiceHub by Ledger1.ai",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VoiceHub by Ledger1.ai",
    description: "Live AI audio agent with ETH billing on Base - VoiceHub by Ledger1.ai",
    images: ["https://engram1.blob.core.windows.net/voicehub/l1voicebg.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon.ico" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VoiceHub by Ledger1.ai",
  },
  category: "utilities",
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#111111",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ overflowX: 'hidden' }}
      >
        {/* Client-side scrub to prevent hydration mismatch from extensions */}
        <HydrationSanitizer />
        {/* Suppress extension-originating "Cannot redefine property: ethereum" errors */}
        <EthereumErrorSilencer />
        <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden>
          <div className="absolute inset-0 max-w-[100vw] overflow-hidden" style={{
            background:
              "radial-gradient(800px 400px at 70% 10%, rgba(77,217,207,0.18), transparent 60%)," +
              "radial-gradient(900px 450px at 10% 80%, rgba(77,217,207,0.10), transparent 60%)",
            filter: "saturate(1.1)",
          }} />
        </div>
        <QueryProvider>
          <ThirdwebAppProvider>
            <Navbar />
            {children}
          </ThirdwebAppProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
