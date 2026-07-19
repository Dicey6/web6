import { useGetAdminStats } from '@workspace/api-client-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Activity, ScrollText, UsersIcon } from 'lucide-react';

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminStats();

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-10 w-48 bg-white/5 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-white/5 rounded-xl" />)}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Admin Overview</h1>
        <p className="text-muted-foreground mt-1">Platform statistics and activity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="glass-card border-white/5">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Total Users</p>
                <h3 className="text-3xl font-bold text-white">{stats?.total_users || 0}</h3>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-xl"><Users className="h-5 w-5 text-amber-500" /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/5">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Users Today</p>
                <h3 className="text-3xl font-bold text-white">{stats?.users_today || 0}</h3>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-xl"><UsersIcon className="h-5 w-5 text-amber-500" /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/5">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Active Challenges</p>
                <h3 className="text-3xl font-bold text-white">{stats?.active_users || 0}</h3>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-xl"><Activity className="h-5 w-5 text-amber-500" /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/5">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Audit Logs</p>
                <h3 className="text-3xl font-bold text-white">{stats?.audit_logs || 0}</h3>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-xl"><ScrollText className="h-5 w-5 text-amber-500" /></div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 gap-6">
        <Card className="glass-card border-white/5">
          <CardHeader>
            <CardTitle>Welcome to Admin Panel</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Use the sidebar to manage users, orders, plans, and payouts. This area requires administrative privileges and actions taken here may affect real users and real capital.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}