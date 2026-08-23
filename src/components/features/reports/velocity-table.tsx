
import { VelocityGroup } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

function VelocityTable({ data, isLoading }: { data: VelocityGroup[] | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Velocity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const groups = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Velocity</CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No velocity data available.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Iteration</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead className="text-right">Completed</TableHead>
                <TableHead className="text-right">Story Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <TableRow key={group.iteration.id}>
                  <TableCell className="font-medium">{group.iteration.name}</TableCell>
                  <TableCell>{new Date(group.iteration.startDate).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(group.iteration.endDate).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">{group.count}</TableCell>
                  <TableCell className="text-right">{group.totalPoints}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export { VelocityTable };
