import { Link } from "react-router-dom";

import { VAULT_ROUTES } from "@/lib/constants";


interface Backlink {
  id: string;
  title: string;
  context?: string | null;
  createdAt: string;
}

interface BacklinksProps {
  backlinks: Backlink[];
}

export function Backlinks({ backlinks }: BacklinksProps) {
  if (!backlinks || backlinks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No pages link to this note yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {backlinks.map((link) => (
        <Link
          key={link.id}
          to={`${VAULT_ROUTES.NOTES}/${link.id}`}
          className="block group"
        >
          <div className="rounded-md border p-3 hover:bg-accent transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-sm group-hover:text-primary transition-colors">
                {link.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(link.createdAt).toLocaleDateString()}
              </span>
            </div>
            {link.context && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                ...{link.context}...
              </p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
