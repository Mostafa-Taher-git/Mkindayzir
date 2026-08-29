
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GuideList } from "@/components/features/guides/guide-list";
import { GuideDetail } from "@/components/features/guides/guide-detail";
import { hasPermission, PERMISSIONS, ROLES } from "@/lib/rbac";
import { Guide } from "@/types";
import { api } from "@/lib/api";

function GuidesPage() {
  const { user } = useAuth();
  const [search, setSearch] = React.useState("");
  const [selectedGuide, setSelectedGuide] = React.useState<Guide | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["guides", search],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      const res = await api.get<{ guides: any[] }>(`/api/guides?${qs.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch guides");
      return res.json() as Promise<{ guides: Guide[] }>;
    },
  });

  const userRole = user?.role as keyof typeof ROLES | undefined;
  const canCreateGuide = userRole ? hasPermission(ROLES[userRole], PERMISSIONS.MANAGE_SETTINGS) : false;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Guide Center</h1>
          <p className="text-muted-foreground mt-1">Help and documentation</p>
        </div>
        {canCreateGuide && (
          <Button>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4">
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            Create Guide
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Guides</CardTitle>
          <CardDescription>Search and browse help documentation</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search guides..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm mb-4"
          />
          <GuideList
            guides={data?.guides ?? []}
            loading={isLoading}
            onSelect={setSelectedGuide}
          />
        </CardContent>
      </Card>

      <GuideDetail
        guide={selectedGuide}
        open={Boolean(selectedGuide)}
        onClose={() => setSelectedGuide(null)}
      />
    </div>
  );
}

export default GuidesPage;