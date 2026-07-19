import { useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { 
  useGetOrder, 
  usePollPaymentStatus, 
  useCreateOrder,
  useGetChallengePlan,
  getGetChallengePlanQueryKey,
  getGetOrderQueryKey,
  getPollPaymentStatusQueryKey,
} from '@workspace/api-client-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, ArrowLeft, Loader2, Wallet, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { motion } from 'framer-motion';

// --- Checkout Page ---
const checkoutSchema = z.object({
  referralCode: z.string().optional(),
});

export function Checkout() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: plan, isLoading, error } = useGetChallengePlan(params.slug || '', {
    query: { enabled: !!params.slug, queryKey: getGetChallengePlanQueryKey(params.slug || '') }
  });

  const createOrder = useCreateOrder();

  const form = useForm<z.infer<typeof checkoutSchema>>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      referralCode: '',
    },
  });

  const onSubmit = (data: z.infer<typeof checkoutSchema>) => {
    if (!plan) return;
    
    createOrder.mutate({
      data: {
        challenge_plan_id: plan.id,
        referral_code: data.referralCode || undefined
      }
    }, {
      onSuccess: (order) => {
        setLocation(`/pay/${order.id}`);
      },
      onError: (err: any) => {
        toast({
          title: "Order creation failed",
          description: err.message || "Something went wrong",
          variant: "destructive"
        });
      }
    });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !plan) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-4">Plan not found</h2>
          <Button onClick={() => setLocation('/challenge-plans')}>Return to Plans</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <Button variant="ghost" onClick={() => setLocation('/challenge-plans')} className="mb-6 -ml-4 text-muted-foreground hover:text-white">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Plans
        </Button>
        
        <h1 className="text-3xl font-bold mb-8">Checkout</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <Card className="glass-card border-white/10 mb-6">
              <CardHeader className="pb-4 border-b border-white/5">
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-medium text-white">{plan.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Account Size</span>
                  <span className="font-medium text-white">{plan.funded_sol} SOL</span>
                </div>
                <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                  <span className="font-semibold text-lg">Total Due</span>
                  <span className="font-bold text-2xl text-primary">${plan.price_usd}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-white/10">
              <CardContent className="pt-6">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="referralCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Referral Code (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter code" className="bg-black/50 border-white/10" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Button 
                      type="submit" 
                      className="w-full bg-primary text-black hover:bg-primary/90 font-bold"
                      disabled={createOrder.isPending}
                    >
                      {createOrder.isPending ? "Processing..." : "Proceed to Payment"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
          
          <div>
            <div className="glass-panel p-6 rounded-xl border-white/5 text-sm text-muted-foreground space-y-4">
              <h3 className="text-white font-semibold text-base mb-2">What happens next?</h3>
              <p>1. You will be redirected to the secure payment page.</p>
              <p>2. Send the exact amount of SOL to the provided wallet address.</p>
              <p>3. Our system automatically detects the transfer (usually within 1-2 minutes).</p>
              <p>4. Once confirmed, your challenge account credentials will be emailed to you and appear in your dashboard instantly.</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// --- Payment Page ---
export function Payment() {
  const params = useParams<{ orderId: string }>();
  const orderId = parseInt(params.orderId || '0', 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: order, isLoading: orderLoading } = useGetOrder(orderId, {
    query: { enabled: !!orderId, queryKey: getGetOrderQueryKey(orderId) }
  });

  const { data: status } = usePollPaymentStatus(orderId, {
    query: { 
      enabled: !!orderId && order?.status !== 'activated' && order?.status !== 'expired' && order?.status !== 'cancelled',
      refetchInterval: 5000,
      queryKey: getPollPaymentStatusQueryKey(orderId),
    }
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard.`,
    });
  };

  const isSuccess = status?.challenge_activated || order?.status === 'activated';
  const isExpired = order?.status === 'expired' || status?.order_status === 'expired';

  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => {
        setLocation('/dashboard');
      }, 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isSuccess, setLocation]);

  if (orderLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!order) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-4">Order not found</h2>
          <Button onClick={() => setLocation('/dashboard')}>Go to Dashboard</Button>
        </div>
      </DashboardLayout>
    );
  }

  const expectedSol = status?.expected_sol || order.expected_sol || 0;
  const treasuryWallet = status?.treasury_wallet || order.treasury_wallet || '';

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto py-8">
        {isSuccess ? (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center py-12 glass-panel rounded-2xl border-primary/30 shadow-[0_0_50px_rgba(20,241,149,0.15)]"
          >
            <div className="mx-auto w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-4">Payment Successful!</h1>
            <p className="text-xl text-muted-foreground mb-8">Your challenge account is being provisioned.</p>
            <div className="animate-pulse text-sm text-primary">Redirecting to dashboard...</div>
          </motion.div>
        ) : isExpired ? (
          <div className="text-center py-12 glass-panel rounded-2xl border-red-500/30">
            <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">Order Expired</h1>
            <p className="text-muted-foreground mb-8">The payment window for this order has closed.</p>
            <Button onClick={() => setLocation('/challenge-plans')}>Start a New Order</Button>
          </div>
        ) : (
          <Card className="glass-card border-white/10 overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-transparent p-6 border-b border-white/5">
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Wallet className="h-6 w-6 text-primary" />
                Complete Payment
              </h1>
              <p className="text-muted-foreground mt-2">Order #{order.id} • {order.plan_name}</p>
            </div>
            
            <CardContent className="p-8">
              <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
                <div className="bg-white p-4 rounded-xl">
                  <QRCodeSVG 
                    value={`solana:${treasuryWallet}?amount=${expectedSol}`} 
                    size={200}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                
                <div className="flex-1 w-full space-y-6">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">Amount to Send</label>
                    <div className="flex items-center gap-3">
                      <div className="bg-black/50 border border-white/10 px-4 py-3 rounded-lg flex-1 font-mono text-xl font-bold text-primary">
                        {expectedSol} SOL
                      </div>
                      <Button variant="outline" size="icon" className="shrink-0" onClick={() => copyToClipboard(expectedSol.toString(), 'Amount')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">Destination Address</label>
                    <div className="flex items-center gap-3">
                      <div className="bg-black/50 border border-white/10 px-4 py-3 rounded-lg flex-1 font-mono text-sm break-all text-white">
                        {treasuryWallet}
                      </div>
                      <Button variant="outline" size="icon" className="shrink-0" onClick={() => copyToClipboard(treasuryWallet, 'Address')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-white/5 space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-black/30 border border-white/5">
                  <div className="flex items-center gap-3">
                    {status?.order_status === 'payment_detected' || status?.order_status === 'confirming' ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="font-medium">Status</span>
                  </div>
                  <span className="text-primary font-medium">
                    {status?.order_status === 'pending' || status?.order_status === 'waiting_for_payment' ? 'Waiting for payment...' : 
                     status?.order_status === 'payment_detected' ? 'Payment detected, confirming...' : 
                     status?.order_status === 'confirming' ? 'Confirming on chain...' : 
                     status?.order_status || order.status}
                  </span>
                </div>
                
                {status?.seconds_remaining && (
                  <p className="text-center text-sm text-muted-foreground">
                    Time remaining: <span className="font-mono text-white">{Math.floor(status.seconds_remaining / 60)}:{(status.seconds_remaining % 60).toString().padStart(2, '0')}</span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

