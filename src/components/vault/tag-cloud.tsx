import { Link } from "react-router-dom";

import { VAULT_ROUTES } from "@/lib/constants";
import { Tag } from "@/types";
import { cn } from "@/lib/utils";

interface TagCloudProps {
  tags: Tag[];
  selectedTagId?: string | null;
  onSelectTag?: (tagId: string | null) => void;
}

const COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
];

export function TagCloud({ tags, selectedTagId, onSelectTag }: TagCloudProps) {
  if (!tags || tags.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No tags created yet.
      </div>
    );
  }

  const getSize = (tag: Tag) => {
    const hash = tag.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const sizes = ["text-xs", "text-sm", "text-base", "text-lg"];
    return sizes[hash % sizes.length];
  };

  const getColor = (tag: Tag) => {
    const hash = tag.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return COLORS[hash % COLORS.length];
  };

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      <button
        onClick={() => onSelectTag?.(null)}
        className={cn(
          "px-3 py-1.5 rounded-full border transition-colors",
          !selectedTagId
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background hover:bg-accent border-input"
        )}
      >
        All
      </button>
      {tags.map((tag) => {
        const isSelected = selectedTagId === tag.id;
        return (
          <Link
            key={tag.id}
            href={
              isSelected
                ? VAULT_ROUTES.HOME
                : `${VAULT_ROUTES.HOME}?tag=${tag.id}`
            }
            onClick={(e) => {
              if (onSelectTag) {
                e.preventDefault();
                onSelectTag(isSelected ? null : tag.id);
              }
            }}
            className={cn(
              "px-3 py-1.5 rounded-full border transition-colors no-underline",
              isSelected
                ? "bg-primary text-primary-foreground border-primary"
                : `${getColor(tag)} ${getSize(tag)} hover:opacity-80`
            )}
          >
            {tag.name}
          </Link>
        );
      })}
    </div>
  );
}
