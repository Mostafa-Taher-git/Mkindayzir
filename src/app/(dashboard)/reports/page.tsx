"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SummaryCards } from "@/components/features/reports/summary-cards";
import { WorkloadTable } from "@/components/features/reports/workload-table";
import { VelocityTable } from "@/components/features/reports/velocity-table";
import { TrendsChart } from "@/components/features/reports/trends-chart";
import { DashboardSummary, WorkloadGroup, VelocityGroup, TrendDay } from "@/types";

function useReport<T>(type: string) {
  return useQuery({
    queryKey: ["reports", type],
    queryFn: async () => {
      const res = await fetch(`/api/reports?type=${type}`);
      if (!res.ok) throw new Error("Failed to fetch report");
      const json = await res.json();
      return json.data as T;
    },
  });
}

function ReportsPage() {
  const [activeTab, setActiveTab] = React.useState("summary");

  const summaryQuery = useReport<DashboardSummary>("summary");
  const workloadQuery = useReport<WorkloadGroup[]>("workload");
  const velocityQuery = useReport<VelocityGroup[]>("velocity");
  const trendsQuery = useReport<TrendDay[]>("trends");

  const handleExport = async () => {
    try {
      const res = await fetch("/api/reports/export");
      if (!res.ok) throw new Error("Failed to export CSV");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "work-items.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground mt-1">Analytics and insights</p>
        </div>
        <Button onClick={handleExport} variant="outline">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          Export CSV
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="workload">Workload</TabsTrigger>
          <TabsTrigger value="velocity">Velocity</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="mt-4">
          <SummaryCards data={summaryQuery.data} isLoading={summaryQuery.isLoading} />
        </TabsContent>
        <TabsContent value="workload" className="mt-4">
          <WorkloadTable data={workloadQuery.data} isLoading={workloadQuery.isLoading} />
        </TabsContent>
        <TabsContent value="velocity" className="mt-4">
          <VelocityTable data={velocityQuery.data} isLoading={velocityQuery.isLoading} />
        </TabsContent>
        <TabsContent value="trends" className="mt-4">
          <TrendsChart data={trendsQuery.data} isLoading={trendsQuery.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ReportsPage;
