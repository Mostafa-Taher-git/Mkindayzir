"use client";

import { Guide } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function GuideList({ guides, onSelect, loading = false }: { guides: Guide[]; onSelect: (guide: Guide) => void; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20 mt-2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (guides.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mb-4">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        </svg>
        <h3 className="text-lg font-semibold mb-1">No guides yet</h3>
        <p className="text-sm text-muted-foreground">Check back later for helpful guides and documentation.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {guides.map((guide) => (
        <button
          key={guide.id}
          onClick={() => onSelect(guide)}
          className="text-left block rounded-lg border bg-card p-4 hover:shadow-md transition-all cursor-pointer h-full"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-medium text-sm leading-tight line-clamp-2">{guide.title}</h3>
            <Badge variant={guide.status === "PUBLISHED" ? "default" : "secondary"} className="shrink-0">
              {guide.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
            {guide.content.substring(0, 150) || "No content"}
          </p>
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs">{guide.category}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(guide.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

export { GuideList };
