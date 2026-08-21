import type { Metadata } from "next";
import { Sora, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/shared/providers";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { SyncStatus } from "@/components/shared/sync-status";
import { ServiceWorkerRegistrar } from "@/components/shared/service-worker-registrar";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mkindayzir - Your Operations, Your Server, Your Control.",
  description: "Self-hosted, local-first, offline-capable Work OS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${sora.variable} ${hanken.variable} ${jetbrains.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <body className="antialiased font-sans">
        <Providers>{children}</Providers>
        <OfflineBanner />
        <SyncStatus />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
