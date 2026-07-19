import { useState } from 'react';
import { useListAdminOrders, useExpireStaleOrders } from '@workspace/api-client-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function AdminOrders() {
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  
  const { data: ordersData, isLoading, refetch } = useListAdminOrders({
    page,
    limit: 10
  });

  const expireOrders = useExpireStaleOrders();

  const handleExpireStale = () => {
    expireOrders.mutate(undefined as any, {
      onSuccess: (res) => {
        toast({ title: "Success", description: `Expired ${res.expired} stale orders.` });
        refetch();
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'activated': case 'confirmed': return 'text-primary bg-primary/10 border-primary/20';
      case 'failed': case 'expired': case 'cancelled': return 'text-red-500 bg-red-500/10 border-red-500/20';
      default: return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    }
  };

  return (
    <AdminLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Orders</h1>
          <p className="text-muted-foreground mt-1">View all challenge purchases.</p>
        </div>
        
        <Button 
          variant="outline" 
          onClick={handleExpireStale} 
          disabled={expireOrders.isPending}
          className="border-white/10 text-muted-foreground hover:text-white"
        >
          {expireOrders.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <AlertCircle className="h-4 w-4 mr-2" />}
          Expire Stale Orders
        </Button>
      </div>

      <Card className="glass-card border-white/10">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading orders...</div>
          ) : ordersData?.data && ordersData.data.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-black/40 border-b border-white/5">
                    <tr>
                      <th className="px-6 py-4 font-medium">Order ID</th>
                      <th className="px-6 py-4 font-medium">User ID</th>
                      <th className="px-6 py-4 font-medium">Plan</th>
                      <th className="px-6 py-4 font-medium">Amount</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {ordersData.data.map((order) => (
                      <tr key={order.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 font-mono text-white">#{order.id}</td>
                        <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                          {order.user_id.substring(0, 8)}...
                        </td>
                        <td className="px-6 py-4 font-medium text-white">{order.plan_name || `Plan ${order.challenge_plan_id}`}</td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-white">${order.amount}</div>
                          {order.expected_sol && <div className="text-xs text-muted-foreground">{order.expected_sol} SOL</div>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
                            {order.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground text-xs">
                          {format(new Date(order.created_at), 'MMM d, yyyy HH:mm')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="p-4 border-t border-white/5 flex items-center justify-between text-sm text-muted-foreground">
                <div>
                  Showing {((page - 1) * 10) + 1} to {Math.min(page * 10, ordersData.total)} of {ordersData.total} orders
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="border-white/10 bg-black/50" 
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="border-white/10 bg-black/50"
                    disabled={page * 10 >= ordersData.total}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No orders found.
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}