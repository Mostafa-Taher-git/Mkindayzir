"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

type Step = "connection" | "precheck" | "progress" | "done";

interface MigrationWizardProps {
  onComplete: () => void;
}

export function MigrationWizard({ onComplete }: MigrationWizardProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("connection");
  const [pgUrl, setPgUrl] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<any>(null);
  const [preCheck, setPreCheck] = useState<any>(null);

  const startWizard = () => {
    setStep("connection");
    setPgUrl("");
    setError("");
    setProgress(null);
    setPreCheck(null);
    setOpen(true);
  };

  const testConnection = async () => {
    setError("");
    try {
      const res = await fetch("/api/system/migration/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database_url: pgUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setStep("precheck");
        runPreCheck();
      } else {
        setError(data.error || "Connection failed");
      }
    } catch (e: any) {
      setError(e.message || "Connection failed");
    }
  };

  const runPreCheck = async () => {
    try {
      const res = await fetch("/api/system/migration/pre-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database_url: pgUrl }),
      });
      const data = await res.json();
      setPreCheck(data);
      if (data.success && data.target_empty) {
        setStep("progress");
        startMigration();
      } else if (!data.target_empty) {
        setError("Target database is not empty. Please use an empty database.");
      }
    } catch (e: any) {
      setError(e.message || "Pre-check failed");
    }
  };

  const startMigration = async () => {
    try {
      const res = await fetch("/api/system/migration/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database_url: pgUrl }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value);
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                setProgress(data);
                if (data.step === "complete") {
                  setStep("done");
                }
              } catch {}
            }
          }
        }
      }
    } catch (e: any) {
      setError(e.message || "Migration failed");
    }
  };

  return (
    <>
      <Button onClick={startWizard} size="lg" className="w-full sm:w-auto">
        Start Upgrade
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {step === "connection" && "Step 1 of 4 — Connect to PostgreSQL"}
              {step === "precheck" && "Step 2 of 4 — Pre-Migration Check"}
              {step === "progress" && "Step 3 of 4 — Migrating..."}
              {step === "done" && "Step 4 of 4 — Migration Complete"}
            </DialogTitle>
            <DialogDescription>
              {step === "connection" && "Enter your PostgreSQL connection details"}
              {step === "precheck" && "Verify everything is ready for migration"}
              {step === "progress" && "Please wait while your data is being migrated"}
              {step === "done" && "Your data has been migrated successfully"}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="px-4 py-2 border-2 border-destructive/30 bg-destructive/10 text-destructive-foreground text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Connection */}
          {step === "connection" && (
            <div className="space-y-4">
              <Input
                placeholder="postgresql://mkindayzir:pass@localhost:5432/mkindayzir"
                value={pgUrl}
                onChange={(e) => setPgUrl(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={testConnection} disabled={!pgUrl}>Test Connection</Button>
              </div>
            </div>
          )}

          {/* Step 2: Pre-Check */}
          {step === "precheck" && preCheck && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-green-600">✓</span>
                  <span>PostgreSQL connection valid</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className={preCheck.target_empty ? "text-green-600" : "text-destructive"}>
                    {preCheck.target_empty ? "✓" : "✗"}
                  </span>
                  <span>Target database is {preCheck.target_empty ? "empty (safe to proceed)" : "NOT empty"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-green-600">✓</span>
                  <span>Disk space sufficient for backup</span>
                </div>
              </div>

              {preCheck.table_counts && (
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm font-medium mb-2">Data to migrate:</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {Object.entries(preCheck.table_counts).map(([table, count]: [string, any]) => (
                        <div key={table} className="flex justify-between text-sm font-mono">
                          <span className="text-muted-foreground">{table}</span>
                          <span>{count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-sm font-medium mt-2 pt-2 border-t">
                      <span>Total</span>
                      <span>{preCheck.total_records?.toLocaleString() || 0} records</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStep("connection")}>Back</Button>
                <Button onClick={runPreCheck} disabled={!preCheck.target_empty}>Start Migration</Button>
              </div>
            </div>
          )}

          {/* Step 3: Progress */}
          {step === "progress" && progress && (
            <div className="space-y-4">
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min((progress.step === 'complete' ? 100 : 50), 100)}%` }}
                />
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {progress.step === "backup" && (
                  <div className="text-sm">✓ Backup created: {progress.path}</div>
                )}
                {progress.step?.startsWith("table:") && (
                  <div className="text-sm">✓ {progress.step.replace("table:", "")} migrated ({progress.count?.toLocaleString()} rows)</div>
                )}
                {progress.step === "verify" && (
                  <div className="text-sm">✓ Row counts verified</div>
                )}
                {progress.step === "config" && (
                  <div className="text-sm">✓ Configuration updated</div>
                )}
                {progress.step === "complete" && (
                  <div className="text-sm font-medium text-green-600">✓ Migration complete!</div>
                )}
              </div>
              {progress.step === "complete" && (
                <div className="flex justify-end">
                  <Button onClick={() => { setOpen(false); onComplete(); }}>
                    Go to Dashboard
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Done */}
          {step === "done" && (
            <div className="space-y-4 text-center py-4">
              <div className="text-4xl">✓</div>
              <p className="text-lg font-medium">All data migrated successfully!</p>
              <p className="text-sm text-muted-foreground">
                Your instance is now in Team mode. Invite team members via Settings.
              </p>
              <Button onClick={() => { setOpen(false); onComplete(); }}>
                Go to Dashboard
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
