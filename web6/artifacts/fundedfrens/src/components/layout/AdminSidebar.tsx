import { Link, useLocation } from 'wouter';
import { 
  LayoutDashboard, Users, ShoppingCart, Target, 
  CreditCard, DollarSign, Network, ScrollText, 
  Settings, LogOut, ArrowLeft
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface AdminSidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export function AdminSidebar({ mobileOpen, setMobileOpen }: AdminSidebarProps) {
  const [location] = useLocation();
  const { signOut } = useAuth();

  const navItems = [
    { href: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
    { href: '/admin/challenges', label: 'Challenge Plans', icon: Target },
    { href: '/admin/payments', label: 'Payments', icon: CreditCard },
    { href: '/admin/payouts', label: 'Payouts', icon: DollarSign },
    { href: '/admin/referrals', label: 'Referrals', icon: Network },
    { href: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:sticky top-0 left-0 z-50 h-[100dvh] w-64 flex-col border-r border-amber-500/20 bg-[#0a0a0b]/95 backdrop-blur-xl transition-transform duration-300 ease-in-out md:translate-x-0 flex",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 pb-2">
          <Link href="/admin/dashboard" className="flex items-center gap-2 transition-opacity hover:opacity-80" onClick={() => setMobileOpen(false)}>
            <div className="h-8 w-8 rounded-md bg-amber-500 flex items-center justify-center">
              <ShieldIcon className="h-5 w-5 text-black" />
            </div>
            <span className="text-xl font-bold tracking-tight">FF Admin</span>
          </Link>
        </div>

        <div className="px-6 py-2 border-b border-white/5 mb-2">
          <Link href="/dashboard" className="flex items-center text-xs text-muted-foreground hover:text-white transition-colors" onClick={() => setMobileOpen(false)}>
            <ArrowLeft className="h-3 w-3 mr-1" /> Back to user app
          </Link>
        </div>

        <div className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                  isActive 
                    ? "bg-amber-500/10 text-amber-500" 
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                )}>
                  <item.icon className={cn(
                    "h-5 w-5", 
                    isActive ? "text-amber-500" : "text-muted-foreground group-hover:text-white"
                  )} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-white/10">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-muted-foreground hover:text-white hover:bg-white/5" 
            onClick={() => signOut()}
          >
            <LogOut className="mr-3 h-5 w-5" />
            Sign Out
          </Button>
        </div>
      </aside>
    </>
  );
}

function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2-1 4-2 7-2 3 0 5 1 7 2a1 1 0 0 1 1 1v7z" />
    </svg>
  );
}