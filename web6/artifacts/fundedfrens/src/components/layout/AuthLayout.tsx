import { ReactNode } from 'react';
import { Link, Redirect } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';

export function AuthLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[#0a0a0b] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#0a0a0b] text-foreground relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-30 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background z-0" />
      
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6 transition-opacity hover:opacity-80">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <span className="text-black font-bold font-mono">FF</span>
            </div>
            <span className="text-xl font-bold tracking-tight">FundedFrens</span>
          </Link>
        </div>
        
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="glass-panel py-8 px-4 shadow sm:rounded-xl sm:px-10 border border-white/5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}