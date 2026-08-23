"use client";

import * as React from "react";
import { useEffect } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { CommandPalette } from "@/components/layout/command-palette";

export function DashboardLayout({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: string;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        mode={mode}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          onMenuClick={() => setSidebarOpen((prev) => !prev)}
          onSearchClick={() => setCommandPaletteOpen(true)}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />
    </div>
  );
}
