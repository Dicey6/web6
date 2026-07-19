import { useListMyOrders } from '@workspace/api-client-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { ShoppingCart, ExternalLink, ArrowRight } from 'lucide-react';

export default function Orders() {
  const { data: ordersData, isLoading } = useListMyOrders();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'activated': case 'confirmed': return 'text-primary bg-primary/10 border-primary/20';
      case 'failed': case 'expired': case 'cancelled': return 'text-red-500 bg-red-500/10 border-red-500/20';
      default: return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">My Orders</h1>
        <p className="text-muted-foreground mt-1">History of your challenge purchases.</p>
      </div>

      <Card className="glass-card border-white/10">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading orders...</div>
          ) : ordersData?.data && ordersData.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-black/40 border-b border-white/5">
                  <tr>
                    <th className="px-6 py-4 font-medium">Order ID</th>
                    <th className="px-6 py-4 font-medium">Date</th>
                    <th className="px-6 py-4 font-medium">Plan</th>
                    <th className="px-6 py-4 font-medium">Amount</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {ordersData.data.map((order) => (
                    <tr key={order.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-mono text-white">#{order.id}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {format(new Date(order.created_at), 'MMM d, yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4 font-medium text-white">{order.plan_name || 'Custom Plan'}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">${order.amount}</div>
                        {order.expected_sol && <div className="text-xs text-muted-foreground">{order.expected_sol} SOL</div>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {order.status !== 'activated' && order.status !== 'expired' && order.status !== 'cancelled' && order.status !== 'failed' ? (
                          <Button asChild size="sm" className="bg-primary text-black hover:bg-primary/90">
                            <Link href={`/pay/${order.id}`}>Pay Now</Link>
                          </Button>
                        ) : order.tx_signature ? (
                          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-white">
                            <a href={`https://solscan.io/tx/${order.tx_signature}`} target="_blank" rel="noreferrer" className="flex items-center">
                              View TX <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No orders found</h3>
              <p className="text-muted-foreground mb-6">You haven't purchased any challenges yet.</p>
              <Button asChild className="bg-primary text-black hover:bg-primary/90">
                <Link href="/challenge-plans">
                  Browse Plans <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}