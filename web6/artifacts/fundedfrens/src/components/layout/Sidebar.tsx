import { Link, useLocation } from 'wouter';
import { LayoutDashboard, ShoppingCart, Users, User, Settings, LogOut, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export function Sidebar({ mobileOpen, setMobileOpen }: SidebarProps) {
  const [location] = useLocation();
  const { signOut, isAdmin } = useAuth();

  const navItems = [
    { href: '/dashboard', label: 'Terminal', icon: LayoutDashboard },
    { href: '/orders', label: 'My Orders', icon: ShoppingCart },
    { href: '/dashboard/referrals', label: 'Referrals', icon: Users },
    { href: '/profile', label: 'Profile', icon: User },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-50 h-[100dvh] w-64 flex flex-col border-r border-white/5 bg-[#0a0a0b] backdrop-blur-xl transition-transform duration-300 ease-in-out shadow-2xl",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-8 pb-4">
          <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80" onClick={() => setMobileOpen(false)}>
            <div className="h-9 w-9 rounded bg-primary flex items-center justify-center shadow-[0_0_15px_rgba(20,241,149,0.3)]">
              <span className="text-black font-black font-mono text-sm tracking-tighter">FF</span>
            </div>
            <span className="text-xl font-black tracking-tight text-white">FundedFrens</span>
          </Link>
        </div>

        <div className="flex-1 px-4 py-8 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
               <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all group cursor-pointer relative overflow-hidden",
                  isActive 
                    ? "text-primary bg-primary/10" 
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                )}>
                  {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r" />}
                  <item.icon className={cn(
                    "h-5 w-5", 
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-white"
                  )} />
                  {item.label}
                </div>
              </Link>
            );
          })}
          
          {isAdmin && (
            <div className="mt-10 pt-6 border-t border-white/5">
              <div className="px-4 py-2 text-xs font-black text-muted-foreground uppercase tracking-widest mb-2 font-mono">
                Admin
              </div>
              <Link href="/admin/dashboard" onClick={() => setMobileOpen(false)}>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-amber-500 hover:bg-amber-500/10 transition-all cursor-pointer border border-transparent hover:border-amber-500/20">
                  <Shield className="h-5 w-5" />
                  Admin Panel
                </div>
              </Link>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-white/5 bg-black/20">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-muted-foreground hover:text-white hover:bg-red-500/10 hover:text-red-500 font-bold h-12 rounded-xl transition-all" 
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