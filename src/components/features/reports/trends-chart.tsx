"use client";

import { TrendDay } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

function TrendsChart({ data, isLoading }: { data: TrendDay[] | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const days = data ?? [];
  const maxValue = Math.max(1, ...days.map((d) => Math.max(d.created, d.resolved)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trends</CardTitle>
      </CardHeader>
      <CardContent>
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No trend data available.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                  <TableHead className="text-right">Resolved</TableHead>
                  <TableHead>Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((day) => {
                  const createdWidth = maxValue > 0 ? (day.created / maxValue) * 100 : 0;
                  const resolvedWidth = maxValue > 0 ? (day.resolved / maxValue) * 100 : 0;
                  return (
                    <TableRow key={day.date}>
                      <TableCell className="font-mono text-xs">{day.date}</TableCell>
                      <TableCell className="text-right">{day.created}</TableCell>
                      <TableCell className="text-right">{day.resolved}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 h-4">
                          <div className="h-2 rounded bg-blue-500 transition-all" style={{ width: `${createdWidth}%`, minWidth: day.created > 0 ? 4 : 0 }} />
                          <div className="h-2 rounded bg-emerald-500 transition-all" style={{ width: `${resolvedWidth}%`, minWidth: day.resolved > 0 ? 4 : 0 }} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { TrendsChart };
