"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MigrationWizard } from "@/components/settings/migration-wizard";

export default function SystemSettingsPage() {
  const router = useRouter();
  const [mode, setMode] = useState<string>("personal");
  const [dbProvider, setDbProvider] = useState<string>("sqlite");
  const [dbUrl, setDbUrl] = useState<string>("");
  const [dbSize, setDbSize] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/system/migration/status")
      .then((r) => r.json())
      .then((data) => {
        setMode(data.mode);
        setDbProvider(data.database_provider);
        setDbUrl(data.database_url || "");
        setDbSize(data.database_size_mb || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6">Loading system settings...</div>;
  }

  const isPersonal = mode === "personal";

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">System</h1>
        <p className="text-muted-foreground mt-1">Database and deployment settings</p>
      </div>

      {/* Current Status */}
      <Card>
        <CardHeader>
          <CardTitle>Current Mode</CardTitle>
          <CardDescription>
            {isPersonal ? "Personal (SQLite)" : "Team (PostgreSQL)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Database</span>
            <span className="font-mono">{dbProvider === "sqlite" ? "SQLite (local file)" : "PostgreSQL"}</span>
          </div>
          {isPersonal && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Database file</span>
              <span className="font-mono break-all text-right">{dbUrl || "Not configured"}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Database size</span>
            <span className="font-mono">{dbSize.toFixed(2)} MB</span>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade to Team Mode */}
      {isPersonal && (
        <Card className="border-2 border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              Upgrade to Team Mode
            </CardTitle>
            <CardDescription>
              Move to PostgreSQL to enable multiple users, real-time collaboration, and better performance at scale.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MigrationWizard onComplete={() => router.refresh()} />
          </CardContent>
        </Card>
      )}

      {/* Downgrade to Personal Mode */}
      {!isPersonal && (
        <Card className="border-2 border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Downgrade to Personal Mode</CardTitle>
            <CardDescription>
              This will export your data to SQLite and disable multi-user features.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Warning: This will remove all team members and disable real-time collaboration.
            </p>
            <Button variant="destructive" disabled>
              Downgrade to Personal Mode (Coming Soon)
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
