import type { Metadata } from "next";
import { Providers } from "@/components/shared/providers";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { SyncStatus } from "@/components/shared/sync-status";
import { ServiceWorkerRegistrar } from "@/components/shared/service-worker-registrar";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
        <OfflineBanner />
        <SyncStatus />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
