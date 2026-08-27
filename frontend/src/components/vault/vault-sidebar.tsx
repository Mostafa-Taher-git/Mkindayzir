import { Link, useLocation, useNavigate } from "react-router-dom";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VAULT_ROUTES } from "@/lib/constants";
import { VaultFolder, ArchiveFolder } from "@/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface VaultSidebarProps {
  folders: VaultFolder[];
  currentFolderId?: string | null;
}

function NewFolderInput({
  autoFocus,
  onSubmit,
  onCancel,
}: {
  autoFocus?: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState("");
  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus={autoFocus}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const v = name.trim();
            if (v) onSubmit(v);
          }
          if (e.key === "Escape") onCancel();
        }}
        onBlur={() => { if (name.trim()) onSubmit(name.trim()); else onCancel(); }}
        placeholder="Folder name"
        className="h-7 text-xs"
      />
    </div>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
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
      className={className}
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function FolderTreeItem({
  folder,
  level = 0,
  onAddSubfolder,
  isAddingSubfolder,
  onCancelSubfolder,
  onCreateSubfolder,
  autoExpand,
  childCount,
  isLastChild,
}: {
  folder: VaultFolder;
  level?: number;
  onAddSubfolder: (parentId: string) => void;
  isAddingSubfolder: boolean;
  onCancelSubfolder: () => void;
  onCreateSubfolder: (parentId: string, name: string) => void;
  autoExpand?: boolean;
  childCount?: number;
  isLastChild?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(!!autoExpand || (childCount !== undefined && childCount > 0));
  React.useEffect(() => { if (autoExpand) setExpanded(true); }, [autoExpand]);
  const pathname = useLocation().pathname;
  const isActive = pathname === `${VAULT_ROUTES.FOLDERS}/${folder.id}`;
  const hasChildren = (folder.children?.length ?? 0) > 0;
  const isRoot = level === 0;
  const railLeft = level * 16 + 8;
  const branchStart = (level - 1) * 16 + 8;

  return (
    <div className="relative">
      {hasChildren && expanded && childCount !== undefined && childCount > 0 && (
        <span
          aria-hidden
          className="absolute w-px bg-outline/60"
          style={{
            left: (level + 1) * 16 + 8,
            top: "32px",
            height: `calc(${childCount} * 36px - 4px)`,
          }}
        />
      )}
      <div className="group flex items-center gap-1 relative">
        {level > 0 && (
          <span
            aria-hidden
            className="absolute top-1/2 h-px bg-outline/60"
            style={{ left: branchStart, width: `${railLeft - branchStart}px` }}
          />
        )}
        <button
          onClick={() => hasChildren && setExpanded(!expanded)}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors flex-1 text-left",
            isActive
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {hasChildren ? (
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
              className={cn("transition-transform shrink-0", expanded && "rotate-90")}
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <FolderIcon className="shrink-0" />
          <Link
            to={`${VAULT_ROUTES.FOLDERS}/${folder.id}`}
            className="truncate flex-1 ml-1"
            onClick={(e) => e.stopPropagation()}
          >
            {folder.name}
          </Link>
        </button>
        {isRoot && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
            onClick={() => onAddSubfolder(folder.id)}
            title="Create subfolder"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
          </Button>
        )}
      </div>
      {isAddingSubfolder && (
        <div className="py-1 pr-2" style={{ paddingLeft: `${level * 16 + 24}px` }}>
          <NewFolderInput
            autoFocus
            onSubmit={(name) => onCreateSubfolder(folder.id, name)}
            onCancel={onCancelSubfolder}
          />
        </div>
      )}
      {expanded && hasChildren && (
        <div>
          {folder.children!.map((child, idx) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              level={level + 1}
              onAddSubfolder={onAddSubfolder}
              isAddingSubfolder={false}
              onCancelSubfolder={onCancelSubfolder}
              onCreateSubfolder={onCreateSubfolder}
              childCount={child.children?.length ?? 0}
              isLastChild={idx === folder.children!.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function VaultSidebar({ folders, currentFolderId }: VaultSidebarProps) {
  const queryClient = useQueryClient();
  const [isAddingRoot, setIsAddingRoot] = React.useState(false);
  const [addingSubfolderFor, setAddingSubfolderFor] = React.useState<string | null>(null);
  const navigate = useNavigate();

  const createFolder = useMutation({
    mutationFn: (data: { name: string; parentId: string | null }) =>
      api.post<{ folder: VaultFolder }>("/api/vault/folders", data),
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: ["vault", "folders"] });
      setIsAddingRoot(false);
      setAddingSubfolderFor(null);
      if (vars.parentId == null) {
        const id = (res as { folder?: { id?: string } })?.folder?.id;
        if (id) navigate(`${VAULT_ROUTES.FOLDERS}/${id}`);
      }
    },
  });

  return (
    <aside className="w-64 border-r bg-muted/30 flex flex-col h-full">
      <div className="p-3 border-b">
        <h2 className="font-semibold text-sm mb-2">Vault</h2>
        <Link to={VAULT_ROUTES.HOME}>
          <Button
            variant={currentFolderId === null || currentFolderId === undefined ? "secondary" : "ghost"}
            size="sm"
            className="w-full justify-start"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <rect width="7" height="9" x="3" y="3" rx="1" />
              <rect width="7" height="5" x="14" y="3" rx="1" />
              <rect width="7" height="9" x="14" y="12" rx="1" />
              <rect width="7" height="5" x="3" y="16" rx="1" />
            </svg>
            All Notes
          </Button>
        </Link>
        <Link to={VAULT_ROUTES.GRAPH}>
          <Button variant="ghost" size="sm" className="w-full justify-start mt-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
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
        <Link to={VAULT_ROUTES.TAGS}>
          <Button variant="ghost" size="sm" className="w-full justify-start mt-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l5.58-5.58c.94-.94.94-2.48 0-3.42L12 2Z" />
              <circle cx="7" cy="7" r="1" />
            </svg>
            Tags
          </Button>
        </Link>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Folders</p>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => { setIsAddingRoot(true); setAddingSubfolderFor(null); }}
            title="Create root folder"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
          </Button>
        </div>
        {isAddingRoot && (
          <div className="px-2 py-1">
            <NewFolderInput
              autoFocus
              onSubmit={(name) => createFolder.mutate({ name, parentId: null })}
              onCancel={() => setIsAddingRoot(false)}
            />
          </div>
        )}
        <div className="space-y-0.5">
          {folders.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1">No folders yet</p>
          ) : (
            folders.map((folder) => (
              <FolderTreeItem
                key={folder.id}
                folder={folder}
                autoExpand={addingSubfolderFor === folder.id}
                onAddSubfolder={(id) => { setAddingSubfolderFor(id); setIsAddingRoot(false); }}
                isAddingSubfolder={addingSubfolderFor === folder.id}
                onCancelSubfolder={() => setAddingSubfolderFor(null)}
                onCreateSubfolder={(parentId, name) => createFolder.mutate({ name, parentId })}
                childCount={folder.children?.length ?? 0}
              />
            ))
          )}
        </div>

        <ArchiveFoldersSection />
      </div>
    </aside>
  );
}

function ArchiveFoldersSection() {
  const { data } = useQuery<{ folders: ArchiveFolder[]; totalItems: number }>({
    queryKey: ["archive", "folders"],
    queryFn: () => fetch("/api/archive/folders", { credentials: "include" }).then((r) => r.json()),
  });
  const folders = data?.folders ?? [];
  const defaults = folders.filter((f) => f.isDefault);
  if (defaults.length === 0) return null;

  const pathname = useLocation().pathname;

  return (
    <>
      <p className="text-xs text-muted-foreground px-2 py-1 mt-2 font-medium">Archive</p>
      <div className="space-y-0.5">
        <Link
          to="/vault/archive"
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors w-full",
            pathname === "/vault/archive"
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <rect width="20" height="5" x="2" y="3" rx="1" />
            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
            <path d="M10 12h4" />
          </svg>
          <span className="truncate">All archived</span>
          {data && data.totalItems > 0 && (
            <span className="ml-auto text-[10px] text-muted-foreground">{data.totalItems}</span>
          )}
        </Link>
        {defaults.map((f) => (
          <Link
            key={f.id}
            to={`/vault/archive/${f.id}`}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors w-full",
              pathname === `/vault/archive/${f.id}`
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <span className="truncate">{f.name}</span>
            {f.count != null && f.count > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground">{f.count}</span>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
