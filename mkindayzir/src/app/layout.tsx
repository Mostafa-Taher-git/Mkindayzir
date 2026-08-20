import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
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
