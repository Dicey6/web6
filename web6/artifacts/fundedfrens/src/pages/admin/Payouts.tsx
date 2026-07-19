import { useState } from 'react';
import { useListAdminPayouts, useApproveAdminPayout, useRejectAdminPayout } from '@workspace/api-client-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Check, X, Search, DollarSign, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

export default function AdminPayouts() {
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  
  const { data: payoutsData, isLoading, refetch } = useListAdminPayouts({
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const approvePayout = useApproveAdminPayout();
  const rejectPayout = useRejectAdminPayout();

  const [dialogMode, setDialogMode] = useState<'approve' | 'reject' | null>(null);
  const [selectedPayout, setSelectedPayout] = useState<any>(null);
  const [txSignature, setTxSignature] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const openDialog = (payout: any, mode: 'approve' | 'reject') => {
    setSelectedPayout(payout);
    setDialogMode(mode);
    setTxSignature('');
    setRejectionReason('');
  };

  const handleAction = () => {
    if (!selectedPayout) return;

    if (dialogMode === 'approve') {
      if (!txSignature) {
        toast({ title: "Required", description: "Transaction signature is required", variant: "destructive" });
        return;
      }
      approvePayout.mutate({ payoutId: selectedPayout.id, data: { tx_signature: txSignature } }, {
        onSuccess: () => {
          toast({ title: "Approved", description: "Payout marked as paid." });
          setDialogMode(null);
          refetch();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
      });
    } else if (dialogMode === 'reject') {
      if (!rejectionReason) {
        toast({ title: "Required", description: "Rejection reason is required", variant: "destructive" });
        return;
      }
      rejectPayout.mutate({ payoutId: selectedPayout.id, data: { rejection_reason: rejectionReason } }, {
        onSuccess: () => {
          toast({ title: "Rejected", description: "Payout request rejected." });
          setDialogMode(null);
          refetch();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
      });
    }
  };

  return (
    <AdminLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Payout Requests</h1>
          <p className="text-muted-foreground mt-1">Review and process trader withdrawals and affiliate earnings.</p>
        </div>
        
        <div className="w-full md:w-48">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="bg-black/50 border-white/10">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payouts</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent className="glass-card border-white/10">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'approve' ? 'Approve Payout' : 'Reject Payout'}</DialogTitle>
            <DialogDescription>
              Payout ID: #{selectedPayout?.id} | Amount: ${selectedPayout?.amount.toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="p-3 bg-white/5 rounded-lg font-mono text-xs text-muted-foreground break-all">
              Wallet: {selectedPayout?.wallet_address}
            </div>
            
            {dialogMode === 'approve' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Solana TX Signature</label>
                <Input 
                  value={txSignature} 
                  onChange={(e) => setTxSignature(e.target.value)} 
                  placeholder="Enter the on-chain transaction signature"
                  className="bg-black/50 border-white/10 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">Please process the transfer manually to the wallet above, then paste the tx signature here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">Rejection Reason</label>
                <Textarea 
                  value={rejectionReason} 
                  onChange={(e) => setRejectionReason(e.target.value)} 
                  placeholder="Explain why this payout is being rejected..."
                  className="bg-black/50 border-white/10"
                  rows={4}
                />
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
            {dialogMode === 'approve' ? (
              <Button onClick={handleAction} className="bg-green-500 text-black hover:bg-green-600 font-bold" disabled={approvePayout.isPending}>
                {approvePayout.isPending ? "Approving..." : "Confirm Paid"}
              </Button>
            ) : (
              <Button onClick={handleAction} variant="destructive" disabled={rejectPayout.isPending}>
                {rejectPayout.isPending ? "Rejecting..." : "Reject Request"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="glass-card border-white/10">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading payouts...</div>
          ) : payoutsData && payoutsData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-black/40 border-b border-white/5">
                  <tr>
                    <th className="px-6 py-4 font-medium">ID</th>
                    <th className="px-6 py-4 font-medium">User</th>
                    <th className="px-6 py-4 font-medium">Amount</th>
                    <th className="px-6 py-4 font-medium">Wallet</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {payoutsData.map((payout: any) => (
                    <tr key={payout.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-mono text-muted-foreground">#{payout.id}</td>
                      <td className="px-6 py-4">
                        <div className="font-mono text-xs text-white">{payout.user_id.substring(0, 8)}...</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(payout.created_at), 'MMM d, yyyy')}</div>
                      </td>
                      <td className="px-6 py-4 font-bold text-amber-500">${payout.amount.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <div className="font-mono text-xs text-muted-foreground truncate max-w-[150px]" title={payout.wallet_address}>
                          {payout.wallet_address}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          payout.status === 'paid' ? 'text-green-500 bg-green-500/10 border-green-500/20' : 
                          payout.status === 'rejected' ? 'text-red-500 bg-red-500/10 border-red-500/20' :
                          'text-amber-500 bg-amber-500/10 border-amber-500/20'
                        }`}>
                          {payout.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {payout.status === 'pending' ? (
                          <>
                            <Button size="icon" variant="outline" className="h-8 w-8 border-green-500/30 text-green-500 hover:bg-green-500/10" onClick={() => openDialog(payout, 'approve')}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="outline" className="h-8 w-8 border-red-500/30 text-red-500 hover:bg-red-500/10" onClick={() => openDialog(payout, 'reject')}>
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : payout.tx_signature ? (
                          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-white" asChild>
                            <a href={`https://solscan.io/tx/${payout.tx_signature}`} target="_blank" rel="noreferrer">View TX</a>
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center">
              <DollarSign className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <p>No payout requests found matching the current filter.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}