import { Component, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AuthProvider } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Error boundary — prevents uncaught render errors from blanking the screen
// ---------------------------------------------------------------------------
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[100dvh] bg-[#0a0a0b] flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-4">
            <p className="text-2xl font-bold text-white">Something went wrong</p>
            <p className="text-sm text-muted-foreground font-mono break-all">
              {(this.state.error as Error).message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-6 py-2 rounded-lg bg-[#14F195] text-black font-semibold text-sm hover:bg-[#14F195]/90 transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import { PublicLayout } from '@/components/layout/PublicLayout';

// Public pages
import Home from '@/pages/landing/Home';
import ChallengePlans from '@/pages/landing/ChallengePlans';
import FAQ from '@/pages/landing/FAQ';
import Contact from '@/pages/landing/Contact';
import Privacy from '@/pages/landing/Privacy';
import Terms from '@/pages/landing/Terms';
import RiskDisclosure from '@/pages/landing/RiskDisclosure';

// Auth pages
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import ForgotPassword from '@/pages/auth/ForgotPassword';

// Dashboard pages
import Dashboard from '@/pages/dashboard/Dashboard';
import Referrals from '@/pages/dashboard/Referrals';
import Orders from '@/pages/dashboard/Orders';
import { Checkout, Payment } from '@/pages/checkout/Checkout';

// Profile pages
import Profile from '@/pages/profile/Profile';
import Settings from '@/pages/profile/Settings';

// Admin pages
import AdminDashboard from '@/pages/admin/Dashboard';
import AdminUsers from '@/pages/admin/Users';
import AdminOrders from '@/pages/admin/Orders';
import AdminChallenges from '@/pages/admin/Challenges';
import AdminPayments from '@/pages/admin/Payments';
import AdminPayouts from '@/pages/admin/Payouts';
import AdminReferrals from '@/pages/admin/Referrals';
import AdminAuditLogs from '@/pages/admin/AuditLogs';
import AdminSettings from '@/pages/admin/Settings';

// Not found
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Auth Routes */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />

      {/* Protected Dashboard Routes */}
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/dashboard/referrals" component={Referrals} />
      <Route path="/orders" component={Orders} />
      <Route path="/checkout/:slug" component={Checkout} />
      <Route path="/pay/:orderId" component={Payment} />
      <Route path="/profile" component={Profile} />
      <Route path="/settings" component={Settings} />

      {/* Admin Routes */}
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/orders" component={AdminOrders} />
      <Route path="/admin/challenges" component={AdminChallenges} />
      <Route path="/admin/payments" component={AdminPayments} />
      <Route path="/admin/payouts" component={AdminPayouts} />
      <Route path="/admin/referrals" component={AdminReferrals} />
      <Route path="/admin/audit-logs" component={AdminAuditLogs} />
      <Route path="/admin/settings" component={AdminSettings} />

      {/* Public Layout Wrapped Routes */}
      <Route path="/">
        {() => <PublicLayout><Home /></PublicLayout>}
      </Route>
      <Route path="/challenge-plans">
        {() => <PublicLayout><ChallengePlans /></PublicLayout>}
      </Route>
      <Route path="/faq">
        {() => <PublicLayout><FAQ /></PublicLayout>}
      </Route>
      <Route path="/contact">
        {() => <PublicLayout><Contact /></PublicLayout>}
      </Route>
      <Route path="/privacy">
        {() => <PublicLayout><Privacy /></PublicLayout>}
      </Route>
      <Route path="/terms">
        {() => <PublicLayout><Terms /></PublicLayout>}
      </Route>
      <Route path="/risk-disclosure">
        {() => <PublicLayout><RiskDisclosure /></PublicLayout>}
      </Route>

      {/* 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;