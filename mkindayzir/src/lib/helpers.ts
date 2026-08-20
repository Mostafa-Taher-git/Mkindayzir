import prisma from "@/lib/prisma";

export async function audit({
  userId,
  action,
  resource,
  resourceId,
  details,
  ipAddress,
  userAgent,
}: {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: unknown;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        details: details as any,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error("Audit log failed:", error);
  }
}
