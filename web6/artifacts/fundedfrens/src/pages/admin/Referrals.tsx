import { useState } from 'react';
import { useListAdminReferrals } from '@workspace/api-client-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Network } from 'lucide-react';

export default function AdminReferrals() {
  const [page, setPage] = useState(1);
  
  const { data: refData, isLoading } = useListAdminReferrals({
    page,
    limit: 10
  });

  return (
    <AdminLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Referral Network</h1>
          <p className="text-muted-foreground mt-1">Monitor affiliate performance and code usage across the platform.</p>
        </div>
      </div>

      <Card className="glass-card border-white/10">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading referral data...</div>
          ) : refData?.data && refData.data.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-black/40 border-b border-white/5">
                    <tr>
                      <th className="px-6 py-4 font-medium">User ID</th>
                      <th className="px-6 py-4 font-medium">Referral Code</th>
                      <th className="px-6 py-4 font-medium text-center">Registrations</th>
                      <th className="px-6 py-4 font-medium text-center">Purchases</th>
                      <th className="px-6 py-4 font-medium text-right">Total Earnings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {refData.data.map((ref: any, idx: number) => (
                      <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                          {ref.user_id ? String(ref.user_id).substring(0, 8) + '...' : 'Unknown'}
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-white bg-white/5 px-2 py-1 rounded">
                            {ref.referral_code || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center font-medium">
                          {ref.registrations_count || 0}
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-amber-500">
                          {ref.qualified_purchases_count || 0}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-white">
                          ${Number(ref.total_earnings_usd || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="p-4 border-t border-white/5 flex items-center justify-between text-sm text-muted-foreground">
                <div>
                  Showing {((page - 1) * 10) + 1} to {Math.min(page * 10, refData.total)} of {refData.total} affiliates
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
                    disabled={page * 10 >= refData.total}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <Network className="h-12 w-12 text-white/10 mb-4" />
              <p>No referral data found in the system yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}