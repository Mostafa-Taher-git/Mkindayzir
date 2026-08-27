
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { NoteVersion } from "@/types";
import { cn } from "@/lib/utils";

interface VersionHistoryProps {
  versions: NoteVersion[];
  currentVersion: number;
  onRestore?: (version: NoteVersion) => void;
  restoring?: boolean;
}

function DiffView({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  return (
    <div className="font-mono text-xs max-h-96 overflow-auto border rounded-md">
      {newLines.map((line, i) => {
        const oldLine = oldLines[i];
        const added = oldLine === undefined;
        const removed = i < oldLines.length && oldLines[i] !== line;
        return (
          <div
            key={i}
            className={cn(
              "px-3 py-1",
              added && "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400",
              removed && "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
            )}
          >
            <span className="text-muted-foreground mr-3 select-none inline-block w-6 text-right">
              {i + 1}
            </span>
            {added && "+ "}
            {removed && "- "}
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}

export function VersionHistory({
  versions,
  currentVersion,
  onRestore,
  restoring = false,
}: VersionHistoryProps) {
  const [selectedVersion, setSelectedVersion] = React.useState<NoteVersion | null>(null);
  const [compareWith, setCompareWith] = React.useState<NoteVersion | null>(null);
  const [showDiff, setShowDiff] = React.useState(false);

  if (!versions || versions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No version history available.
      </div>
    );
  }

  const sortedVersions = [...versions].sort((a, b) => b.version - a.version);

  const handleCompare = (v1: NoteVersion, v2: NoteVersion) => {
    setSelectedVersion(v1);
    setCompareWith(v2);
    setShowDiff(true);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {sortedVersions.map((version) => {
          const isCurrent = version.version === currentVersion;
          return (
            <div
              key={version.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedVersion(version)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedVersion(version);
                }
              }}
              className={cn(
                "flex items-center justify-between p-3 rounded-md border transition-colors cursor-pointer hover:border-primary",
                isCurrent && "border-primary bg-primary/5"
              )}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">v{version.version}</span>
                  {isCurrent && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(version.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setSelectedVersion(version); }}
                >
                  View
                </Button>
                {!isCurrent && onRestore && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        const current = versions.find((v) => v.version === currentVersion);
                        if (current) handleCompare(version, current);
                      }}
                    >
                      Diff
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onRestore(version); }}
                      disabled={restoring}
                    >
                      {restoring ? "Restoring..." : "Restore"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!selectedVersion && !showDiff} onOpenChange={(open) => !open && setSelectedVersion(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Version {selectedVersion?.version}</DialogTitle>
            <DialogDescription>
              {selectedVersion && new Date(selectedVersion.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-md p-4 text-sm whitespace-pre-wrap">
            {selectedVersion?.content || "No content"}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDiff} onOpenChange={(open) => !open && setShowDiff(false)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Diff: v{compareWith?.version} → v{selectedVersion?.version}</DialogTitle>
            <DialogDescription>
              Showing changes between versions
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {selectedVersion && compareWith && (
              <DiffView
                oldContent={compareWith.content}
                newContent={selectedVersion.content}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
