import { useState } from 'react';
import { useGetReferralDashboard, useListMyPayouts, useCreatePayout } from '@workspace/api-client-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, DollarSign, Users, TrendingUp, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function Referrals() {
  const { data: refData, isLoading: refLoading } = useGetReferralDashboard();
  const { data: payoutsData, isLoading: payoutsLoading, refetch: refetchPayouts } = useListMyPayouts();
  const createPayout = useCreatePayout();
  const { toast } = useToast();
  
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutWallet, setPayoutWallet] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${type} copied to clipboard.` });
  };

  const handleRequestPayout = () => {
    const amount = parseFloat(payoutAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    
    if (amount > (refData?.available_earnings_usd || 0)) {
      toast({ title: "Amount exceeds available balance", variant: "destructive" });
      return;
    }

    if (!payoutWallet || payoutWallet.length < 32) {
      toast({ title: "Invalid Solana wallet address", variant: "destructive" });
      return;
    }

    createPayout.mutate({
      data: {
        amount,
        wallet_address: payoutWallet
      }
    }, {
      onSuccess: () => {
        toast({ title: "Payout Requested", description: "Your payout request has been submitted." });
        setIsDialogOpen(false);
        setPayoutAmount('');
        refetchPayouts();
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to request payout", variant: "destructive" });
      }
    });
  };

  if (refLoading || payoutsLoading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-white/5 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-white/5 rounded-xl" />)}
          </div>
          <div className="h-64 bg-white/5 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Affiliate Program</h1>
        <p className="text-muted-foreground mt-1">Earn by referring other traders to FundedFrens.</p>
      </div>

      {refData && (
        <Card className="glass-card border-white/10 mb-8 border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="w-full md:w-auto flex-1">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Your Referral Link</label>
                <div className="flex items-center gap-3">
                  <div className="bg-black/50 border border-white/10 px-4 py-3 rounded-lg flex-1 font-mono text-sm text-primary break-all">
                    {refData.referral_link}
                  </div>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(refData.referral_link, 'Link')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="w-full md:w-48 shrink-0">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Referral Code</label>
                <div className="flex items-center gap-3">
                  <div className="bg-black/50 border border-white/10 px-4 py-3 rounded-lg flex-1 font-mono text-lg font-bold text-white text-center">
                    {refData.referral_code}
                  </div>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(refData.referral_code, 'Code')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="glass-card border-white/5">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Total Referrals</p>
                <h3 className="text-2xl font-bold text-white">{refData?.registrations_count || 0}</h3>
              </div>
              <div className="p-2 bg-white/5 rounded-lg"><Users className="h-5 w-5 text-muted-foreground" /></div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card border-white/5">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Active Purchasers</p>
                <h3 className="text-2xl font-bold text-white">{refData?.qualified_purchases_count || 0}</h3>
              </div>
              <div className="p-2 bg-white/5 rounded-lg"><TrendingUp className="h-5 w-5 text-primary" /></div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card border-white/5">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Available to Withdraw</p>
                <h3 className="text-2xl font-bold text-primary">${refData?.available_earnings_usd?.toFixed(2) || '0.00'}</h3>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg"><DollarSign className="h-5 w-5 text-primary" /></div>
            </div>
            {(refData?.available_earnings_usd || 0) > 0 && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="w-full mt-4 bg-primary text-black hover:bg-primary/90">Request Payout</Button>
                </DialogTrigger>
                <DialogContent className="glass-card border-white/10 sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Request Payout</DialogTitle>
                    <DialogDescription>
                      Available balance: <span className="font-bold text-primary">${refData?.available_earnings_usd?.toFixed(2)}</span>
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Amount (USD)</label>
                      <Input 
                        type="number" 
                        max={refData?.available_earnings_usd} 
                        value={payoutAmount} 
                        onChange={(e) => setPayoutAmount(e.target.value)}
                        placeholder="0.00"
                        className="bg-black/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Solana Wallet Address</label>
                      <Input 
                        value={payoutWallet} 
                        onChange={(e) => setPayoutWallet(e.target.value)}
                        placeholder="Solana address to receive funds"
                        className="bg-black/50"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleRequestPayout} disabled={createPayout.isPending} className="bg-primary text-black">
                      {createPayout.isPending ? "Processing..." : "Confirm Request"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </CardContent>
        </Card>
        
        <Card className="glass-card border-white/5">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Total Earned</p>
                <h3 className="text-2xl font-bold text-white">${refData?.total_earnings_usd?.toFixed(2) || '0.00'}</h3>
              </div>
              <div className="p-2 bg-white/5 rounded-lg"><CheckCircle2 className="h-5 w-5 text-muted-foreground" /></div>
            </div>
            <div className="mt-4 text-xs text-muted-foreground flex justify-between">
              <span>Pending: ${refData?.pending_earnings_usd?.toFixed(2) || '0.00'}</span>
              <span>Paid: ${refData?.paid_earnings_usd?.toFixed(2) || '0.00'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="glass-card border-white/5">
          <CardHeader>
            <CardTitle>Recent Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            {refData?.history && refData.history.length > 0 ? (
              <div className="space-y-4">
                {refData.history.slice(0, 5).map((earning) => (
                  <div key={earning.id} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${earning.status === 'paid' ? 'bg-primary/20 text-primary' : 'bg-amber-500/20 text-amber-500'}`}>
                        <DollarSign className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">Referral Purchase</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(earning.created_at), 'MMM d, yyyy')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">+${earning.amount.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground capitalize">{earning.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No earnings yet. Share your link to get started!
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card border-white/5">
          <CardHeader>
            <CardTitle>Payout History</CardTitle>
          </CardHeader>
          <CardContent>
            {payoutsData && payoutsData.length > 0 ? (
              <div className="space-y-4">
                {payoutsData.map((payout: any) => (
                  <div key={payout.id} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-3">
                      {payout.status === 'paid' ? <CheckCircle2 className="h-5 w-5 text-primary" /> : 
                       payout.status === 'rejected' ? <AlertCircle className="h-5 w-5 text-red-500" /> :
                       <Clock className="h-5 w-5 text-amber-500" />}
                      <div>
                        <p className="text-sm font-medium text-white">Payout Request</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(payout.created_at), 'MMM d, yyyy')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-white">${payout.amount.toFixed(2)}</p>
                      <p className={`text-xs capitalize ${payout.status === 'paid' ? 'text-primary' : payout.status === 'rejected' ? 'text-red-500' : 'text-amber-500'}`}>
                        {payout.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No payouts requested yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}