import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'wouter';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin" />
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0b] text-foreground">
      {/* Mobile top bar — fixed, full width, always on top */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 border-b border-white/5 glass-nav z-40 flex items-center px-4 gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setMobileOpen(!mobileOpen)}>
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-bold text-base tracking-tight">FundedFrens</span>
      </header>

      {/* Sidebar — always position:fixed, slides in/out on mobile, visible on md+ */}
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* Main — full width on mobile, offset 256 px on desktop to clear the sidebar */}
      <main className="min-h-[100dvh] pt-16 md:pt-0 md:ml-64 overflow-x-hidden">
        <div className="px-4 py-5 md:px-8 md:py-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
