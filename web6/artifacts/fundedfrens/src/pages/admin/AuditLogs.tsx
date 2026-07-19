import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';

export default function AdminAuditLogs() {
  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Audit Logs</h1>
        <p className="text-muted-foreground mt-1">Platform-wide activity tracking.</p>
      </div>

      <Card className="glass-card border-white/10 max-w-2xl mx-auto mt-16">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
          <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-6">
            <ScrollText className="h-10 w-10 text-amber-500" />
          </div>
          <CardTitle className="text-2xl mb-4">Coming Soon</CardTitle>
          <p className="text-muted-foreground mb-8">
            The comprehensive audit logging system is currently under development. 
            Once released, this panel will show detailed logs of all administrative actions, 
            status changes, and critical system events for compliance purposes.
          </p>
          <Button asChild className="bg-amber-500 text-black hover:bg-amber-600">
            <Link href="/admin/dashboard">Return to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}