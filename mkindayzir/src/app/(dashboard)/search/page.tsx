"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchResults } from "@/components/features/search/search-results";
import { SearchResult } from "@/types";

type SearchType = "work_item" | "vault_note" | "guide";

function SearchPage() {
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [types, setTypes] = React.useState<SearchType[]>(["work_item", "vault_note", "guide"]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const toggleType = (type: SearchType) => {
    setTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const { data, isLoading } = useQuery({
    queryKey: ["search", debouncedQuery, types],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return { results: [] as SearchResult[] };
      const qs = new URLSearchParams();
      qs.set("q", debouncedQuery.trim());
      if (types.length > 0 && types.length < 3) {
        qs.set("types", types.join(","));
      }
      const res = await fetch(`/api/search?${qs.toString()}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json() as Promise<{ results: SearchResult[] }>;
    },
    enabled: debouncedQuery.trim().length > 0,
  });

  const results = data?.results ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Search</h1>
        <p className="text-muted-foreground mt-1">Search across work items, vault notes, and guides</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
          <CardDescription>Enter a query to find what you need</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xl"
          />
          <div className="flex items-center gap-2">
            {(["work_item", "vault_note", "guide"] as SearchType[]).map((type) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`inline-flex items-center border border-outline px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  types.includes(type)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {type === "work_item" ? "Work Items" : type === "vault_note" ? "Vault Notes" : "Guides"}
              </button>
            ))}
          </div>
          <SearchResults results={results} isLoading={isLoading} query={debouncedQuery} />
        </CardContent>
      </Card>
    </div>
  );
}

export default SearchPage;
