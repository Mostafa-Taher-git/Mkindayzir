
import { useQuery } from "@tanstack/react-query";
import { VAULT_ROUTES } from "@/lib/constants";
import { VaultFolder } from "@/types";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { GraphView } from "@/components/vault/graph-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function VaultGraphPage() {
  const { data: foldersData } = useQuery<{ folders: VaultFolder[] }>({
    queryKey: ["vault", "folders"],
    queryFn: () => api.get<{ folders: VaultFolder[] }>("/api/vault/folders"),
  });

  const { data: graphData } = useQuery<{ nodes: any[]; links: any[] }>({
    queryKey: ["vault", "graph"],
    queryFn: () => api.get<{ nodes: any[]; links: any[] }>("/api/vault/graph"),
  });

  const folders = foldersData?.folders ?? [];
  const nodes = graphData?.nodes ?? [];
  const links = graphData?.links ?? [];

  const handleNodeClick = (nodeId: string) => {
    window.location.href = `${VAULT_ROUTES.NOTES}/${nodeId}`;
  };

  return (
    <div className="flex h-full">
      <VaultSidebar folders={folders} currentFolderId={null} />
      <div className="flex-1 overflow-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Knowledge Graph</h1>
          <p className="text-muted-foreground mt-1">Visualize how your notes are connected</p>
        </div>

        {nodes.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No connections yet</CardTitle>
              <CardDescription>Create notes with internal links to see them appear here.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Start by creating notes and linking them together using wiki-style links like{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">[[Note Title]]</code>.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{nodes.length} notes, {links.length} connections</p>
            </div>
            <GraphView nodes={nodes} links={links} onNodeClick={handleNodeClick} />
          </div>
        )}
      </div>
    </div>
  );
}
