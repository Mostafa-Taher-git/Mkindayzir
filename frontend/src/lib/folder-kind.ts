export type FolderKind = "root" | "sub" | "none" | "archived";

export function getFolderKind(
  folder: { parentId?: string | null | undefined } | null | undefined,
  archived: boolean = false,
): FolderKind {
  if (archived) return "archived";
  if (!folder) return "none";
  if (folder.parentId) return "sub";
  return "root";
}

export const folderKindColor: Record<FolderKind, string> = {
  root: "#3b82f6",
  sub: "#8b5cf6",
  none: "#f59e0b",
  archived: "#475569",
};

export const folderKindClass: Record<FolderKind, string> = {
  root: "text-blue-500",
  sub: "text-violet-500",
  none: "text-amber-500",
  archived: "text-zinc-600",
};
