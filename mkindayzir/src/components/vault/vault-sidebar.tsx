"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { VAULT_ROUTES } from "@/lib/constants";
import { VaultFolder } from "@/types";
import { cn } from "@/lib/utils";

interface VaultSidebarProps {
  folders: VaultFolder[];
  currentFolderId?: string | null;
  onCreateFolder?: (parentId: string | null) => void;
}

function FolderTreeItem({
  folder,
  level = 0,
  currentFolderId,
  onCreateFolder,
}: {
  folder: VaultFolder;
  level?: number;
  currentFolderId?: string | null;
  onCreateFolder?: (parentId: string | null) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const pathname = usePathname();
  const isActive = pathname === `${VAULT_ROUTES.FOLDERS}/${folder.id}`;

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors w-full",
            isActive
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {folder.children && folder.children.length > 0 ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn("transition-transform", expanded && "rotate-90")}
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          ) : (
            <span className="w-3.5" />
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
          <span className="truncate">{folder.name}</span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
          onClick={() => onCreateFolder?.(folder.id)}
          title="Create subfolder"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
        </Button>
      </div>
      {expanded && folder.children && folder.children.length > 0 && (
        <div>
          {folder.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              level={level + 1}
              currentFolderId={currentFolderId}
              onCreateFolder={onCreateFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function VaultSidebar({
  folders,
  currentFolderId,
  onCreateFolder,
}: VaultSidebarProps) {
  return (
    <aside className="w-64 border-r bg-muted/30 flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-sm">Vault</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onCreateFolder?.(null)}
            title="Create root folder"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
          </Button>
        </div>
        <Link href={VAULT_ROUTES.HOME}>
          <Button
            variant={currentFolderId === null || currentFolderId === undefined ? "secondary" : "ghost"}
            size="sm"
            className="w-full justify-start"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-2"
            >
              <rect width="7" height="9" x="3" y="3" rx="1" />
              <rect width="7" height="5" x="14" y="3" rx="1" />
              <rect width="7" height="9" x="14" y="12" rx="1" />
              <rect width="7" height="5" x="3" y="16" rx="1" />
            </svg>
            All Notes
          </Button>
        </Link>
        <Link href={VAULT_ROUTES.GRAPH}>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start mt-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-2"
            >
              <circle cx="12" cy="12" r="3" />
              <circle cx="19" cy="5" r="2" />
              <circle cx="5" cy="19" r="2" />
              <path d="M7.5 7.5 10 10" />
              <path d="M14 14l2.5 2.5" />
              <path d="M19 7v3" />
              <path d="M17 5h3" />
            </svg>
            Knowledge Graph
          </Button>
        </Link>
        <Link href={VAULT_ROUTES.TAGS}>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start mt-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-2"
            >
              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l5.58-5.58c.94-.94.94-2.48 0-3.42L12 2Z" />
              <circle cx="7" cy="7" r="1" />
            </svg>
            Tags
          </Button>
        </Link>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Folders</p>
        <div className="space-y-0.5">
          {folders.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1">No folders yet</p>
          ) : (
            folders.map((folder) => (
              <div key={folder.id} className="group">
                <FolderTreeItem
                  folder={folder}
                  currentFolderId={currentFolderId}
                  onCreateFolder={onCreateFolder}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
