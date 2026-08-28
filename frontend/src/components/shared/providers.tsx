
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toast";
import { WorkspaceProvider } from "@/hooks/use-workspace";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>
        {children}
        <Toaster />
      </WorkspaceProvider>
    </QueryClientProvider>
  );
}
