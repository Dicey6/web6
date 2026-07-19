import { Link } from 'wouter';
import { useListChallengePlans } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, AlertCircle, Zap, Shield, Lock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function ChallengePlans() {
  const { data: plans, isLoading, error } = useListChallengePlans();
  const activePlans = plans?.filter(p => p.status === 'active')?.sort((a, b) => a.display_order - b.display_order) || [];

  return (
    <div className="w-full min-h-screen bg-[#0a0a0b] py-24">
      <div className="w-full max-w-7xl mx-auto px-6 lg:px-10">
        
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-6 text-white">
            Choose Your Edge
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            Select an evaluation size that fits your strategy. Pass the challenge to trade our capital and keep up to 90% of the profits.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-12 border-red-500/30 bg-red-500/10 text-red-200">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading Plans</AlertTitle>
            <AlertDescription>Failed to connect to the network. Please try again later.</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-24">
            {[1, 2, 3].map(i => (
              <div key={i} className="glass-panel animate-pulse border-white/5 h-[600px] rounded-2xl" />
            ))}
          </div>
        ) : activePlans.length === 0 ? (
          <div className="text-center py-24 glass-panel rounded-2xl border-white/5 max-w-2xl mx-auto">
            <Lock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">No plans available</h3>
            <p className="text-muted-foreground">We are currently calibrating new evaluation parameters. Check back shortly.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-24">
            {activePlans.map((plan) => (
              <Card key={plan.id} className="glass-panel border-white/10 hover:border-primary/40 transition-all duration-300 relative group flex flex-col bg-black/40 backdrop-blur-xl">
                <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none" />
                
                <CardHeader className="text-center pb-8 border-b border-white/5">
                  <div className="inline-flex mx-auto items-center justify-center px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono font-medium text-muted-foreground mb-4 uppercase tracking-wider">
                    {plan.name}
                  </div>
                  <CardTitle className="text-5xl font-black text-white flex items-center justify-center gap-3">
                    {plan.funded_sol} <span className="text-2xl text-primary">SOL</span>
                  </CardTitle>
                  {plan.funded_usd_estimate && (
                    <p className="text-xs text-muted-foreground mt-3 font-mono">
                      ~${plan.funded_usd_estimate.toLocaleString()} (approx. at current market conditions)
                    </p>
                  )}
                </CardHeader>
                
                <CardContent className="pt-8 flex-1">
                  <ul className="space-y-4 font-mono text-sm">
                    <li className="flex justify-between items-center pb-3 border-b border-white/5">
                      <span className="text-muted-foreground">Profit Target</span>
                      <span className="font-bold text-white">{plan.profit_target_pct}%</span>
                    </li>
                    <li className="flex justify-between items-center pb-3 border-b border-white/5">
                      <span className="text-muted-foreground">Max Drawdown</span>
                      <span className="font-bold text-red-400">{plan.max_drawdown_pct}%</span>
                    </li>
                    <li className="flex justify-between items-center pb-3 border-b border-white/5">
                      <span className="text-muted-foreground">Daily Drawdown</span>
                      <span className="font-bold text-red-400">{plan.daily_drawdown_pct}%</span>
                    </li>
                    <li className="flex justify-between items-center pb-3 border-b border-white/5">
                      <span className="text-muted-foreground">Min Trading Days</span>
                      <span className="font-bold text-white">{plan.min_trading_days}</span>
                    </li>
                    <li className="flex justify-between items-center pb-3 border-b border-white/5">
                      <span className="text-muted-foreground">Max Position Size</span>
                      <span className="font-bold text-white">{plan.max_position_size_pct}%</span>
                    </li>
                    <li className="flex justify-between items-center pb-3 border-b border-white/5">
                      <span className="text-muted-foreground">Max Open Positions</span>
                      <span className="font-bold text-white">{plan.max_open_positions}</span>
                    </li>
                    <li className="flex justify-between items-center">
                      <span className="text-muted-foreground">Reactivation Cost</span>
                      <span className="font-bold text-primary">{plan.reactivation_cost_pct}%</span>
                    </li>
                  </ul>
                </CardContent>
                
                <CardFooter className="pt-6 border-t border-white/5 flex flex-col items-center mt-auto">
                  <div className="text-3xl font-black mb-6 text-white">${plan.price_usd} <span className="text-lg text-muted-foreground">USD</span></div>
                  <Button asChild className="w-full bg-white text-black hover:bg-primary font-bold shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(20,241,149,0.3)] transition-all h-14 text-base">
                    <Link href={`/checkout/${plan.slug}`}>Purchase Challenge</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Rules Explanation */}
        <div className="max-w-5xl mx-auto glass-panel p-8 md:p-12 rounded-3xl border-white/5 bg-black/50">
          <div className="flex items-center gap-3 mb-10 justify-center">
            <Shield className="h-6 w-6 text-primary" />
            <h2 className="text-2xl md:text-3xl font-black text-white text-center">Core Parameters</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" /> Profit Target
              </h3>
              <p className="text-muted-foreground leading-relaxed text-sm">
                The percentage of initial account balance required in closed profits to pass. Once hit, close all open trades to trigger evaluation success.
              </p>
            </div>
            
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" /> Maximum Drawdown
              </h3>
              <p className="text-muted-foreground leading-relaxed text-sm">
                The hard deck. Your equity cannot drop below this percentage of the starting balance at any point, including floating PnL.
              </p>
            </div>
            
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" /> Daily Drawdown
              </h3>
              <p className="text-muted-foreground leading-relaxed text-sm">
                The maximum equity loss permitted in a single trading day, calculated against your balance at 00:00 UTC daily.
              </p>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}