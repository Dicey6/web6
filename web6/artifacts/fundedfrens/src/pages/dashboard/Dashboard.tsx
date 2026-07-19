import { useGetDashboard, useGetMyChallenges } from '@workspace/api-client-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import {
  Wallet, Target, Activity, CheckCircle2, XCircle, Clock, Copy, Plus,
  TrendingUp, Crosshair, AlertTriangle, MessageSquare, Zap, BarChart3,
  LineChart as LineChartIcon, ShieldAlert, Check, Circle, Settings
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';

// ── MOCK DATA FOR CHARTS ──────────────────────────────────────────────────────
const MOCK_EQUITY = [
  { day: '01', balance: 100000 },
  { day: '02', balance: 101200 },
  { day: '03', balance: 100800 },
  { day: '04', balance: 102400 },
  { day: '05', balance: 103500 },
  { day: '06', balance: 102900 },
  { day: '07', balance: 104200 },
  { day: '08', balance: 105800 },
  { day: '09', balance: 107100 },
];

const MOCK_DAILY = [
  { day: '02', pnl: 1200 },
  { day: '03', pnl: -400 },
  { day: '04', pnl: 1600 },
  { day: '05', pnl: 1100 },
  { day: '06', pnl: -600 },
  { day: '07', pnl: 1300 },
  { day: '08', pnl: 1600 },
  { day: '09', pnl: 1300 },
];

const MOCK_WIN_LOSS = [
  { name: 'Wins', value: 72 },
  { name: 'Losses', value: 28 },
];
const PIE_COLORS = ['#14F195', '#ef4444'];

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#111114',
    borderColor: '#ffffff1a',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '11px',
    fontFamily: 'monospace',
  },
  itemStyle: { color: '#14F195' },
};

export default function Dashboard() {
  const { data: dashboard, isLoading: dashLoading } = useGetDashboard();
  const { data: challenges, isLoading: challengesLoading } = useGetMyChallenges();
  const { toast } = useToast();

  const copyRefCode = () => {
    if (dashboard?.referral_code) {
      navigator.clipboard.writeText(dashboard.referral_code);
      toast({ title: 'Copied!', description: 'Referral code copied to clipboard.' });
    }
  };

  const isLoading = dashLoading || challengesLoading;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div className="h-10 w-48 bg-white/5 rounded-lg animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-white/5 rounded-2xl animate-pulse" />
        </div>
      </DashboardLayout>
    );
  }

  const activeChallenge = challenges?.find(c => c.status === 'active' || c.status === 'pending');
  const pastChallenges = challenges?.filter(c => c.status !== 'active' && c.status !== 'pending') || [];

  const planTarget  = activeChallenge?.profit_target_pct  || activeChallenge?.plan?.profit_target_pct  || 10;
  const planMaxDD   = activeChallenge?.max_drawdown_pct    || activeChallenge?.plan?.max_drawdown_pct    || 10;
  const planDailyDD = activeChallenge?.plan?.daily_drawdown_pct || 5;
  const planMinDays = activeChallenge?.plan?.min_trading_days   || 5;

  const MOCK_RULES = [
    { name: 'Profit Target',   current: 7.1, allowed: planTarget,  unit: '%', status: 'pass',    progress: (7.1 / planTarget)  * 100 },
    { name: 'Max Drawdown',    current: 2.4, allowed: planMaxDD,   unit: '%', status: 'warning', progress: (2.4 / planMaxDD)   * 100 },
    { name: 'Daily Drawdown',  current: 0.8, allowed: planDailyDD, unit: '%', status: 'pass',    progress: (0.8 / planDailyDD) * 100 },
    { name: 'Min Trading Days',current: 4,   allowed: planMinDays, unit: 'd', status: 'warning', progress: (4   / planMinDays) * 100 },
  ];

  return (
    <DashboardLayout>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-white/10 bg-white/5
                        text-muted-foreground text-[10px] font-mono mb-3 uppercase tracking-widest">
          <Zap className="h-3 w-3 text-primary" /> Session Active
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none">
              Terminal
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Welcome back, {dashboard?.profile?.username || 'Trader'}
            </p>
          </div>

          {activeChallenge ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-xl shrink-0">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="font-bold text-primary text-xs uppercase tracking-wider">
                {activeChallenge.plan?.name || 'Evaluation'} Active
              </span>
            </div>
          ) : (
            <Button asChild className="bg-primary text-black hover:bg-primary/90 font-bold h-10 text-sm shrink-0">
              <Link href="/challenge-plans">
                <Plus className="h-4 w-4 mr-1.5" /> Start Evaluation
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* ── HERO STAT CARDS ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: 'FUNDED',
            icon: <Wallet className="h-3.5 w-3.5" />,
            value: <>{activeChallenge?.plan?.funded_sol || '0.00'} <span className="text-xs text-primary">SOL</span></>,
            sub: `~$${activeChallenge?.plan?.funded_usd_estimate?.toLocaleString() || '0.00'}`,
          },
          {
            label: 'PNL',
            icon: <TrendingUp className="h-3.5 w-3.5 text-primary" />,
            value: <span className="text-primary">+7.1%</span>,
            sub: `Target: ${planTarget}%`,
          },
          {
            label: 'WIN RATE',
            icon: <Target className="h-3.5 w-3.5" />,
            value: '72.0%',
            sub: '100 Trades',
          },
          {
            label: 'SPLIT',
            icon: <Activity className="h-3.5 w-3.5" />,
            value: '80/20',
            sub: 'Phase 1',
          },
        ].map(({ label, icon, value, sub }) => (
          <Card key={label} className="glass-panel border-white/5 bg-black/40">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-muted-foreground tracking-widest">{label}</span>
                <span className="text-muted-foreground">{icon}</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-white leading-none">{value}</div>
              <div className="text-[10px] text-muted-foreground mt-1.5 font-mono truncate">{sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── CHARTS + OBJECTIVES ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">

        {/* Left: charts stack */}
        <div className="xl:col-span-2 space-y-4">

          {/* Equity curve */}
          <Card className="glass-panel border-white/5 bg-black/40">
            <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
              <CardTitle className="text-xs font-mono font-bold tracking-widest text-muted-foreground">
                EQUITY CURVE
              </CardTitle>
              <LineChartIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-2 pb-4 pt-0">
              <div className="h-[200px] sm:h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={MOCK_EQUITY} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#14F195" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#14F195" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                    <XAxis dataKey="day" stroke="#ffffff30" fontSize={10} tickMargin={8} axisLine={false} tickLine={false} />
                    <YAxis
                      stroke="#ffffff30" fontSize={10} axisLine={false} tickLine={false}
                      width={42} tickFormatter={(v) => `$${v / 1000}k`}
                    />
                    <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`$${v.toLocaleString()}`, 'Balance']} />
                    <Area type="monotone" dataKey="balance" stroke="#14F195" strokeWidth={2} fillOpacity={1} fill="url(#colorBalance)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Daily PNL + Win/Loss side by side on sm+ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="glass-panel border-white/5 bg-black/40">
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-xs font-mono font-bold tracking-widest text-muted-foreground">
                  DAILY PNL
                </CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-2 pb-4 pt-0">
                <div className="h-[160px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={MOCK_DAILY} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                      <XAxis dataKey="day" stroke="#ffffff30" fontSize={10} tickMargin={8} axisLine={false} tickLine={false} />
                      <YAxis stroke="#ffffff30" fontSize={10} axisLine={false} tickLine={false} width={38} />
                      <RechartsTooltip
                        {...TOOLTIP_STYLE}
                        cursor={{ fill: '#ffffff08' }}
                        formatter={(v: number) => [`$${v}`, 'PnL']}
                      />
                      <Bar dataKey="pnl" radius={[3, 3, 0, 0]} maxBarSize={24}>
                        {MOCK_DAILY.map((entry, i) => (
                          <Cell key={i} fill={entry.pnl >= 0 ? '#14F195' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-white/5 bg-black/40">
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-xs font-mono font-bold tracking-widest text-muted-foreground">
                  WIN / LOSS
                </CardTitle>
                <Crosshair className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-2 pb-4 pt-0">
                <div className="h-[160px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={MOCK_WIN_LOSS} cx="50%" cy="50%"
                        innerRadius="52%" outerRadius="72%"
                        paddingAngle={4} dataKey="value" stroke="none"
                      >
                        {MOCK_WIN_LOSS.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip {...TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-black text-white">72%</span>
                    <span className="text-[9px] text-muted-foreground font-mono tracking-widest">WIN RATE</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right: objectives + metrics */}
        <div className="space-y-4">
          <Card className="glass-panel border-white/5 bg-black/40">
            <CardHeader className="py-3 px-4 border-b border-white/5">
              <CardTitle className="text-xs font-mono font-bold tracking-widest text-white flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" /> OBJECTIVES
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pt-4 pb-4 space-y-5">
              {MOCK_RULES.map((rule) => (
                <div key={rule.name}>
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-xs text-muted-foreground font-mono">{rule.name}</span>
                    <span className="text-xs font-bold text-white tabular-nums">
                      {rule.current}{rule.unit}
                      <span className="text-muted-foreground font-normal"> / {rule.allowed}{rule.unit}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        rule.status === 'fail'    ? 'bg-red-500' :
                        rule.status === 'warning' ? 'bg-amber-400' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(rule.progress, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-panel border-white/5 bg-black/40">
            <CardHeader className="py-3 px-4 border-b border-white/5">
              <CardTitle className="text-xs font-mono font-bold tracking-widest text-white">METRICS</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pt-4 pb-4">
              <ul className="space-y-3 font-mono text-xs">
                {[
                  { label: 'Avg Hold Time', value: '4h 12m',   color: 'text-white' },
                  { label: 'Avg Win',        value: '+$420.50', color: 'text-primary' },
                  { label: 'Avg Loss',       value: '-$180.20', color: 'text-red-500' },
                  { label: 'Max Position',   value: '12% / 30%',color: 'text-white' },
                ].map(({ label, value, color }) => (
                  <li key={label} className="flex justify-between items-center">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-bold ${color}`}>{value}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── REFERRAL + TELEGRAM ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">

        <Card className="glass-panel border-white/5 bg-black/40 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-28 h-28 bg-primary/5 rounded-bl-full pointer-events-none" />
          <CardHeader className="py-4 px-4">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Refer & Earn
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-xl border border-white/5 bg-white/[0.02]">
                <div className="text-[10px] text-muted-foreground font-mono mb-1 tracking-widest">TOTAL REFS</div>
                <div className="text-xl font-black text-white">{dashboard?.referral_count || 0}</div>
              </div>
              <div className="p-3 rounded-xl border border-white/5 bg-white/[0.02]">
                <div className="text-[10px] text-muted-foreground font-mono mb-1 tracking-widest">EARNINGS</div>
                <div className="text-xl font-black text-primary">$0.00</div>
              </div>
            </div>

            {dashboard?.referral_code ? (
              <div>
                <div className="text-[10px] text-muted-foreground font-mono mb-2 tracking-widest">YOUR CODE</div>
                <div className="flex items-center gap-2">
                  <div className="bg-black border border-white/10 rounded-lg px-3 py-2.5 flex-1 font-mono text-sm text-white tracking-widest font-bold min-w-0 truncate">
                    {dashboard.referral_code}
                  </div>
                  <Button variant="outline" size="icon" className="border-white/10 h-10 w-10 shrink-0" onClick={copyRefCode}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button asChild variant="outline" className="w-full border-white/10 h-10 text-sm">
                <Link href="/dashboard/referrals">View Affiliate Dashboard</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel border-white/5 bg-black/40">
          <CardHeader className="py-4 px-4">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-400" /> Telegram
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {dashboard?.profile?.telegram_status === 'linked' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-white">Connected</p>
                    {dashboard.profile.telegram_username && (
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        @{dashboard.profile.telegram_username}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  You'll receive trade alerts, margin warnings, and payout updates in Telegram.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-5 text-center border border-white/5 border-dashed rounded-xl bg-white/[0.01]">
                <MessageSquare className="h-8 w-8 text-muted-foreground/25 mb-3" />
                <h4 className="font-bold text-white text-sm mb-1">Not Connected</h4>
                <p className="text-xs text-muted-foreground mb-4 max-w-xs">
                  Instant trade alerts, margin warnings, and payout updates — directly in Telegram.
                </p>
                <Button asChild variant="outline" className="border-white/10 bg-black text-xs h-9 px-4">
                  <Link href="/settings">
                    <Settings className="h-3 w-3 mr-1.5" /> Link Telegram
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── ACTIVITY + HISTORY ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Activity Timeline — simple single-column at all sizes */}
        <Card className="glass-panel border-white/5 bg-black/40">
          <CardHeader className="py-4 px-4">
            <CardTitle className="text-base font-bold text-white">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {dashboard?.recent_activity && dashboard.recent_activity.length > 0 ? (
              <div className="relative pl-5">
                {/* vertical line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/5" />
                <div className="space-y-5">
                  {dashboard.recent_activity.map((log) => (
                    <div key={log.id} className="relative">
                      {/* dot */}
                      <div className="absolute -left-[18px] top-1 w-2.5 h-2.5 rounded-full border border-primary bg-primary/20 shrink-0" />
                      <div className="p-3 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="font-bold text-sm text-white leading-tight">{log.action}</div>
                        <time className="text-[10px] font-mono text-muted-foreground">
                          {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                        </time>
                        {log.details && (
                          <p className="text-xs mt-1.5 text-muted-foreground leading-relaxed">{log.details}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground font-mono text-xs border border-white/5 border-dashed rounded-xl">
                No recent activity.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Challenge History */}
        <Card className="glass-panel border-white/5 bg-black/40">
          <CardHeader className="py-4 px-4">
            <CardTitle className="text-base font-bold text-white">Challenge History</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {pastChallenges.length > 0 ? (
              <div className="space-y-3">
                {pastChallenges.map((challenge) => {
                  const passed  = challenge.status === 'passed' || challenge.status === 'completed';
                  const failed  = challenge.status === 'failed';
                  return (
                    <div key={challenge.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.02]">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-1.5 rounded-lg shrink-0 ${
                          passed ? 'bg-primary/10 text-primary' :
                          failed ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                        }`}>
                          {passed ? <Check className="h-4 w-4" /> :
                           failed ? <XCircle className="h-4 w-4" /> :
                                    <Clock className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-white text-sm truncate">
                            {challenge.plan?.name || `Plan #${challenge.challenge_plan_id}`}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {challenge.started_at ? format(new Date(challenge.started_at), 'MMM d, yyyy') : 'N/A'}
                          </div>
                        </div>
                      </div>
                      <span className={`text-[10px] font-black font-mono tracking-widest uppercase px-2.5 py-1 rounded border shrink-0 ${
                        passed ? 'text-primary border-primary/20 bg-primary/5' :
                        failed ? 'text-red-500 border-red-500/20 bg-red-500/5' :
                                 'text-amber-500 border-amber-500/20 bg-amber-500/5'
                      }`}>
                        {challenge.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground font-mono text-xs border border-white/5 border-dashed rounded-xl">
                No past challenges.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </DashboardLayout>
  );
}
