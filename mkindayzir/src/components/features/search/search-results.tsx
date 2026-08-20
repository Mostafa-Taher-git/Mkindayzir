"use client";

import { SearchResult } from "@/types";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/constants";

const TYPE_LABELS: Record<string, string> = {
  work_item: "Work Items",
  vault_note: "Vault Notes",
  guide: "Guides",
};

const TYPE_COLORS: Record<string, string> = {
  work_item: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  vault_note: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  guide: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

function getResultHref(result: SearchResult): string {
  switch (result.type) {
    case "work_item":
      return `/dashboard/work-items/${result.id}`;
    case "vault_note":
      return `${ROUTES.VAULT}/notes/${result.id}`;
    case "guide":
      return `${ROUTES.GUIDES}/${result.id}`;
    default:
      return "#";
  }
}

function SearchResults({ results, isLoading, query }: { results: SearchResult[]; isLoading: boolean; query: string }) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (results.length === 0 && query) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mb-4">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <h3 className="text-lg font-semibold mb-1">No results found</h3>
        <p className="text-sm text-muted-foreground">Try adjusting your search query.</p>
      </div>
    );
  }

  if (!query) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mb-4">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <h3 className="text-lg font-semibold mb-1">Search</h3>
        <p className="text-sm text-muted-foreground">Enter a query to search across work items, vault notes, and guides.</p>
      </div>
    );
  }

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, result) => {
    if (!acc[result.type]) acc[result.type] = [];
    acc[result.type].push(result);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([type, items]) => (
        <Card key={type}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[type] || "bg-muted text-muted-foreground"}`}>
                {TYPE_LABELS[type] || type}
              </span>
              <span className="text-sm font-normal text-muted-foreground">{items.length} result{items.length !== 1 ? "s" : ""}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {items.map((result) => (
                <Link
                  key={`${result.type}-${result.id}`}
                  href={getResultHref(result)}
                  className="flex items-start justify-between gap-4 rounded-md border p-3 hover:bg-accent transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{result.title}</p>
                    {result.excerpt && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{result.excerpt}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{result.score.toFixed(2)}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export { SearchResults };
