import { Link } from "react-router-dom";

import { VAULT_ROUTES } from "@/lib/constants";
import { Tag } from "@/types";
import { cn } from "@/lib/utils";

interface TagCloudProps {
  tags: Tag[];
  selectedTagId?: string | null;
  onSelectTag?: (tagId: string | null) => void;
}

const FALLBACK_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#06b6d4",
  "#6366f1",
];

function tagStyle(tag: Tag): React.CSSProperties {
  let color = tag.color;
  if (!color) {
    const hash = tag.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    color = FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
  }
  return {
    backgroundColor: `${color}22`,
    color,
    borderColor: `${color}55`,
  };
}

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

  return (
    <div className="flex flex-wrap gap-2 justify-center items-center py-2">
      <button
        onClick={() => onSelectTag?.(null)}
        className={cn(
          "px-3 py-1.5 rounded-full border transition-colors text-sm",
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
            to={
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
            style={tagStyle(tag)}
            className={cn(
              "px-3 py-1.5 rounded-full border transition-opacity no-underline",
              getSize(tag),
              isSelected && "ring-2 ring-offset-2 ring-offset-background",
              "hover:opacity-80",
            )}
          >
            {tag.name}
          </Link>
        );
      })}
    </div>
  );
}
