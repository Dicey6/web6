import { ReactNode } from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col relative bg-[#0a0a0b] text-foreground">
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background z-0" />
      <Navbar />
      <main className="flex-1 relative z-10 flex flex-col">
        {children}
      </main>
      <Footer />
    </div>
  );
}