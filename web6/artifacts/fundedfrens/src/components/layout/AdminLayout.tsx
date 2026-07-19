import { ReactNode, useState } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'wouter';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin" />
      </div>
    );
  }
  
  if (!user) return <Redirect to="/login" />;
  if (!isAdmin) return <Redirect to="/dashboard" />;

  return (
    <div className="min-h-[100dvh] flex bg-[#0a0a0b] text-foreground">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 border-b border-border/50 glass-nav z-40 flex items-center px-4">
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className="ml-4 font-bold text-lg tracking-tight">FF Admin</div>
      </div>

      <AdminSidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      
      <main className="flex-1 min-w-0 pt-20 md:pt-6 p-4 md:p-8 md:ml-64 transition-all overflow-y-auto z-10">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}