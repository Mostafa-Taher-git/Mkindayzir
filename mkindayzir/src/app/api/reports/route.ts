import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { z } from "zod";
import { ReportService } from "@/services/report.service";

const reportService = new ReportService();

const reportQuerySchema = z.object({
  type: z.enum(["summary", "workload", "velocity", "trends"]).default("summary"),
  projectId: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const parsed = reportQuerySchema.parse(params);

    switch (parsed.type) {
      case "summary":
        const summary = await reportService.getDashboardSummary(user.id, user);
        return NextResponse.json({ data: summary });

      case "workload":
        const workload = await reportService.getWorkloadReport(user);
        return NextResponse.json({ data: workload });

      case "velocity":
        const velocity = await reportService.getVelocityReport(user, parsed.projectId);
        return NextResponse.json({ data: velocity });

      case "trends":
        const trends = await reportService.getTrendReport(user);
        return NextResponse.json({ data: trends });

      default:
        return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid report type" } }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch report" } },
      { status: 500 }
    );
  }
}
