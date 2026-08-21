import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { ROUTES } from '@/lib/constants';

export default async function DashboardRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect(ROUTES.LOGIN);
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
