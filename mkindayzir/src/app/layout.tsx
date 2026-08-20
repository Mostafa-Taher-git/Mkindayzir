import type { Metadata } from "next";
import { Sora, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { Providers } from "@/components/shared/providers";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { SyncStatus } from "@/components/shared/sync-status";
import { ServiceWorkerRegistrar } from "@/components/shared/service-worker-registrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mkindayzir - Your Operations, Your Server, Your Control.",
  description: "Self-hosted, local-first, offline-capable Work OS",
};

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${sora.variable} ${hankenGrotesk.variable} ${jetBrainsMono.variable} antialiased`}
      >
        <SessionProvider>
          <Providers>{children}</Providers>
        </SessionProvider>
        <OfflineBanner />
        <SyncStatus />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
