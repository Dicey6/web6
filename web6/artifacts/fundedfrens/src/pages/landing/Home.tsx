import { Link } from 'wouter';
import { motion, useInView } from 'framer-motion';
import { useListChallengePlans } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowUpRight, CheckCircle2, Shield, Activity, RefreshCw, Target, Check, LineChart, Users, Coins, Zap } from 'lucide-react';
import { useRef } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE, delay: i * 0.07 },
  }),
};

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      custom={delay}
      variants={fadeUp}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const STATS = [
  { value: '90%', label: 'Profit Split' },
  { value: '1,000', label: 'Max SOL Funded' },
  { value: '3', label: 'Challenge Plans' },
  { value: '100%', label: 'On-Chain Payouts' },
];

const STEPS = [
  { title: 'Create account', desc: 'Sign up securely and access the terminal.' },
  { title: 'Choose a plan', desc: 'Select an evaluation size for your edge.' },
  { title: 'Pay in SOL', desc: 'Send the fee. Instant on-chain detection.' },
  { title: 'Get evaluated', desc: 'Receive your simulated trading account.' },
  { title: 'Follow rules', desc: 'Trade strictly within risk parameters.' },
  { title: 'Pass challenge', desc: 'Hit the target without breaching drawdowns.' },
  { title: 'Get funded', desc: 'Receive a live funded account.' },
  { title: 'Earn profit', desc: 'Keep up to 90% of profits, paid in SOL.' }
];

const RULES = [
  { label: 'Evaluation Period', value: '21 Days' },
  { label: 'Min Trading Days', value: '5 Days' },
  { label: 'Required Win Rate', value: '75%' },
  { label: 'Max Position Size', value: '30%' },
  { label: 'Max Open Positions', value: '3' },
  { label: 'Portfolio Loss Limit', value: '50%' },
  { label: 'Overnight Holding', value: 'Allowed' },
  { label: 'Trading Hours', value: '24/7' },
  { label: 'Supported Launchpads', value: 'All Solana Launchpads' },
  { label: 'Strategy Limits', value: 'None (within risk rules)' },
];

const METRICS = [
  'Entry & Exit', 'PnL %', 'Hold Time', 'Position Size', 'Win / Loss', 'Peak Unrealized Profit', 'Maximum Adverse Excursion', 'Risk Taken'
];

const FAQ_ITEMS = [
  { q: "How do I get funded?", a: "Create an account, select a challenge plan, pay the one-time evaluation fee in SOL, and prove your trading edge by hitting the profit target while respecting the risk rules." },
  { q: "What happens if I fail?", a: "If you violate a risk rule (e.g., maximum drawdown, daily loss limit), the challenge is failed. You can reactivate your account for 40% of the original challenge price." },
  { q: "Can I hold overnight?", a: "Yes. We do not restrict overnight holding. You are free to hold positions overnight and over the weekends." },
  { q: "Can I trade anytime?", a: "Yes. Crypto markets never sleep, and neither do we. Trading is available 24/7." },
  { q: "Which launchpads are supported?", a: "We support all Solana launchpads. You can trade any token available on the Solana ecosystem as long as you follow the risk parameters." },
  { q: "How do referrals work?", a: "Every user receives a unique referral code. When a new user registers using your code and purchases a challenge, you earn a commission. Earnings are tracked in your dashboard and paid in USDC or SOL." },
  { q: "How do payouts work?", a: "Once you are funded, you can request a payout of your profits. Payouts are settled on-chain directly to your Solana wallet. First payout is available 14 days after your first funded trade, and bi-weekly thereafter." },
  { q: "How are payments verified?", a: "Payments for challenges are verified automatically on-chain. When you send SOL to the provided address, our system detects the transaction within seconds." },
  { q: "Do I need KYC?", a: "KYC is required only when you pass the evaluation and are ready to be onboarded as a funded trader. The evaluation phase does not require KYC." },
  { q: "How is my performance tracked?", a: "Our system tracks every trade you execute. We monitor Entry/Exit points, PnL %, Hold Time, Position Size, Peak Unrealized Profit, Maximum Adverse Excursion, and overall Risk Taken." }
];

export default function Home() {
  const { data: plans, isLoading } = useListChallengePlans();
  const activePlans = plans?.filter((p) => p.status === 'active').sort((a, b) => a.display_order - b.display_order).slice(0, 3) ?? [];

  return (
    <div className="w-full min-h-screen bg-[#0a0a0b] text-white overflow-hidden">
      {/* ── HERO ── */}
      <section className="relative pt-32 pb-20">
        <div className="pointer-events-none absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-primary/5 blur-[120px]" />
        
        <div className="max-w-7xl mx-auto px-6 lg:px-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-mono mb-8 uppercase tracking-widest"
            >
              <Zap className="h-3.5 w-3.5" /> Solana Prop Trading
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: EASE, delay: 0.05 }}
              className="text-5xl sm:text-6xl xl:text-7xl font-black tracking-tighter leading-[1.05] mb-6"
            >
              Prove your edge.<br />
              <span className="text-primary">Trade our</span><br />
              capital.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
              className="text-lg text-muted-foreground leading-relaxed max-w-lg mb-10"
            >
              Pass the evaluation, get funded up to 1,000 SOL, and keep up
              to 90% of every trade you win. Settled on-chain, instantly.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE, delay: 0.22 }}
              className="flex flex-wrap gap-4"
            >
              <Button asChild size="lg" className="bg-primary text-black hover:bg-primary/90 font-bold px-8 h-14 text-base shadow-[0_0_30px_rgba(20,241,149,0.15)] transition-all">
                <Link href="/challenge-plans">Buy Challenge <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/10 hover:bg-white/5 font-medium px-8 h-14 text-base">
                <Link href="/challenge-plans">View Challenge Plans</Link>
              </Button>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent blur-3xl rounded-full" />
            <div className="glass-panel border-white/10 rounded-2xl p-6 relative z-10 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                <div className="flex gap-2 items-center">
                  <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
                  <span className="font-mono text-sm font-bold text-white tracking-widest">TERMINAL_ACTIVE</span>
                </div>
                <Activity className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-4 font-mono text-sm">
                <div className="flex justify-between items-center p-3 rounded bg-black/40 border border-white/5">
                  <span className="text-muted-foreground">ENTRY</span>
                  <span className="text-primary font-bold">142.50 SOL</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded bg-black/40 border border-white/5">
                  <span className="text-muted-foreground">PNL</span>
                  <span className="text-primary font-bold">+18.4%</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded bg-black/40 border border-white/5">
                  <span className="text-muted-foreground">STATUS</span>
                  <span className="text-white font-bold">EVALUATION_PASSED</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="max-w-7xl mx-auto px-6 lg:px-10 mt-32"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 border-y border-white/5 divide-x divide-white/5">
            {STATS.map((s) => (
              <div key={s.value} className="px-6 py-8 flex flex-col items-center justify-center text-center">
                <span className="text-4xl font-black text-white tabular-nums mb-2">{s.value}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-mono">{s.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <Reveal className="mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-4">How it works</h2>
            <p className="text-muted-foreground">From registration to funded. The path is simple.</p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i} className="glass-panel border-white/5 rounded-2xl p-6 relative overflow-hidden group hover:border-primary/30 transition-colors">
                <div className="absolute -right-4 -top-4 text-[6rem] font-black text-white/[0.02] group-hover:text-primary/[0.05] transition-colors leading-none select-none">
                  0{i + 1}
                </div>
                <div className="relative z-10">
                  <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CHALLENGE PLANS ── */}
      <section className="py-24 relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <Reveal className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-16">
            <div>
              <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-4">Choose your edge</h2>
              <p className="text-muted-foreground">Select an account size. Prove your profitability.</p>
            </div>
            <Button asChild variant="ghost" className="text-primary hover:text-primary/80 hover:bg-primary/10">
              <Link href="/challenge-plans">View all plans <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </Reveal>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => <div key={i} className="h-[400px] rounded-2xl bg-white/5 animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {activePlans.map((plan, i) => (
                <Reveal key={plan.id} delay={i} className="glass-panel border-white/5 hover:border-primary/40 transition-all rounded-2xl flex flex-col p-8 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="mb-6 border-b border-white/5 pb-6">
                    <h3 className="text-lg font-bold text-white mb-2">{plan.name}</h3>
                    <div className="flex items-end gap-2 mb-1">
                      <span className="text-4xl font-black text-primary">{plan.funded_sol} SOL</span>
                    </div>
                    {plan.funded_usd_estimate && (
                      <p className="text-xs text-muted-foreground font-mono">~${plan.funded_usd_estimate.toLocaleString()} (approx. at current market conditions)</p>
                    )}
                  </div>
                  
                  <div className="space-y-4 mb-8 flex-1">
                    {[
                      ['Profit Target', `${plan.profit_target_pct}%`],
                      ['Max Drawdown', `${plan.max_drawdown_pct}%`],
                      ['Daily Drawdown', `${plan.daily_drawdown_pct}%`],
                      ['Min Trading Days', plan.min_trading_days],
                      ['Max Position Size', `${plan.max_position_size_pct}%`],
                      ['Max Open Positions', plan.max_open_positions],
                      ['Reactivation', `${plan.reactivation_cost_pct}% cost`],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between items-center text-sm font-mono">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="text-white font-bold">{val}</span>
                      </div>
                    ))}
                  </div>
                  
                  <Button asChild className="w-full h-12 bg-white text-black hover:bg-primary hover:text-black font-bold text-base transition-colors">
                    <Link href={`/checkout/${plan.slug}`}>
                      Pay ${plan.price_usd} USD
                    </Link>
                  </Button>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── TRADING RULES ── */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <Reveal className="mb-16 text-center max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-4">Firm Rules</h2>
            <p className="text-muted-foreground">We provide capital. You provide edge. These are the parameters you must follow.</p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {RULES.map((rule, i) => (
              <Reveal key={rule.label} delay={i} className="bg-white/5 border border-white/5 rounded-xl p-5 flex items-center justify-between">
                <span className="text-muted-foreground text-sm font-medium">{rule.label}</span>
                <span className="text-white font-bold text-sm">{rule.value}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT WE TRACK ── */}
      <section className="py-24 border-t border-white/5 relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <Reveal>
              <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-6">Precision Tracking</h2>
              <p className="text-muted-foreground leading-relaxed mb-8">
                Every trade is recorded, analyzed, and evaluated. Our terminal captures the metrics that separate gamblers from profitable traders.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {METRICS.map((metric) => (
                  <div key={metric} className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-white">{metric}</span>
                  </div>
                ))}
              </div>
            </Reveal>
            <Reveal className="relative">
              <div className="glass-panel border-white/10 rounded-2xl p-8 relative z-10">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono text-muted-foreground">WIN/LOSS RATIO</span>
                    <span className="text-xl font-black text-primary">78%</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[78%]" />
                  </div>
                  <div className="flex items-center justify-between mt-8">
                    <span className="text-sm font-mono text-muted-foreground">MAX ADVERSE EXCURSION</span>
                    <span className="text-xl font-black text-red-500">-12.4%</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 w-[12.4%]" />
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── REFERRAL & REACTIVATION ── */}
      <section className="py-24 border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 grid grid-cols-1 md:grid-cols-2 gap-12">
          <Reveal className="glass-panel border-white/10 rounded-2xl p-8 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-2xl font-black text-white mb-4">Referral Program</h3>
            <p className="text-muted-foreground mb-8">
              Every registered user gets a unique code. Refer traders to FundedFrens and earn commission on their first challenge purchase. Earnings tracked in dashboard and paid in USDC or SOL.
            </p>
          </Reveal>
          
          <Reveal delay={1} className="glass-panel border-white/10 rounded-2xl p-8 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <RefreshCw className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-2xl font-black text-white mb-4">Reactivation</h3>
            <p className="text-muted-foreground mb-8">
              Violated a rule? It happens to the best. Reactivate your failed challenge for just 40% of the original price and try again under standard firm policies.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6">
          <Reveal className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-4">Frequently Asked Questions</h2>
          </Reveal>
          
          <Reveal>
            <Accordion type="single" collapsible className="w-full">
              {FAQ_ITEMS.map((item, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border-white/10">
                  <AccordionTrigger className="text-left font-semibold text-lg hover:text-primary transition-colors">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed text-base">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </section>

    </div>
  );
}
