import { Link, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const NAV_LINKS = [
  { href: '/challenge-plans', label: 'Plans' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
];

export function Navbar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#0a0a0b]/80 backdrop-blur-xl border-b border-white/[0.06] shadow-[0_1px_0_rgba(255,255,255,0.04)]'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-[60px] flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <img
            src="/logo.jpeg"
            alt="FundedFrens"
            className="h-8 w-8 rounded-lg object-cover"
          />
          <span className="text-[15px] font-bold tracking-tight text-white group-hover:text-white/90 transition-colors">
            FundedFrens
          </span>
        </Link>

        {/* Center nav */}
        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm transition-colors ${
                location === link.href
                  ? 'text-white font-medium'
                  : 'text-muted-foreground hover:text-white font-normal'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right actions */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <Button asChild size="sm" variant="outline"
              className="border-white/10 hover:border-white/20 text-white bg-white/[0.03] hover:bg-white/[0.06] text-sm h-9 px-4">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost"
                className="text-muted-foreground hover:text-white text-sm h-9 px-4">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="sm"
                className="bg-[#14F195] text-black hover:bg-[#14F195]/90 font-semibold text-sm h-9 px-4 shadow-[0_0_16px_rgba(20,241,149,0.25)] hover:shadow-[0_0_24px_rgba(20,241,149,0.4)] transition-all">
                <Link href="/challenge-plans">Get Funded</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile burger */}
        <button
          className="md:hidden text-muted-foreground hover:text-white transition-colors p-1"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="md:hidden overflow-hidden bg-[#0a0a0b]/95 backdrop-blur-xl border-b border-white/[0.06]"
          >
            <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`py-2.5 text-sm font-medium transition-colors ${
                    location === link.href ? 'text-white' : 'text-muted-foreground hover:text-white'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-4 pt-4 border-t border-white/[0.06] flex flex-col gap-2.5">
                {user ? (
                  <Button asChild className="w-full" variant="outline">
                    <Link href="/dashboard" onClick={() => setOpen(false)}>Dashboard</Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild variant="outline" className="w-full border-white/10 text-white bg-white/[0.03]">
                      <Link href="/login" onClick={() => setOpen(false)}>Log in</Link>
                    </Button>
                    <Button asChild className="w-full bg-[#14F195] text-black font-bold hover:bg-[#14F195]/90">
                      <Link href="/challenge-plans" onClick={() => setOpen(false)}>Get Funded</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
