import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getConfig, isPersonalMode } from '@/lib/config';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { ROUTES } from '@/lib/constants';

export default async function DashboardRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    const config = getConfig();
    if (isPersonalMode() && config.autoLogin) {
      redirect('/api/auth/auto-login');
    }
    redirect(ROUTES.LOGIN);
  }

  const mode = getConfig().mode;

  return <DashboardLayout mode={mode}>{children}</DashboardLayout>;
}
