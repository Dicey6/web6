import { Link } from 'wouter';

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#0a0a0b]/80 backdrop-blur-sm pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
          <div className="col-span-1 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
                <span className="text-black font-bold font-mono text-xs">FF</span>
              </div>
              <span className="text-base font-bold tracking-tight text-white">FundedFrens</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Premium proprietary trading firm for Solana meme coin traders. Prove your edge, get real capital.
            </p>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wider uppercase mb-4">Trading</h3>
            <ul className="space-y-3">
              <li><Link href="/challenge-plans" className="text-sm text-muted-foreground hover:text-primary transition-colors">Challenge Plans</Link></li>
              <li><Link href="/faq" className="text-sm text-muted-foreground hover:text-primary transition-colors">Rules & FAQ</Link></li>
              <li><Link href="/dashboard/referrals" className="text-sm text-muted-foreground hover:text-primary transition-colors">Affiliate Program</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wider uppercase mb-4">Company</h3>
            <ul className="space-y-3">
              <li><Link href="/contact" className="text-sm text-muted-foreground hover:text-primary transition-colors">Contact Us</Link></li>
              <li><a href="https://twitter.com" target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors">Twitter (X)</a></li>
              <li><a href="https://discord.com" target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors">Discord</a></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wider uppercase mb-4">Legal</h3>
            <ul className="space-y-3">
              <li><Link href="/terms" className="text-sm text-muted-foreground hover:text-primary transition-colors">Terms of Service</Link></li>
              <li><Link href="/privacy" className="text-sm text-muted-foreground hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/risk-disclosure" className="text-sm text-muted-foreground hover:text-primary transition-colors">Risk Disclosure</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="mt-16 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} FundedFrens. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground/60 max-w-xl text-center md:text-right">
            Trading cryptocurrencies carries a high level of risk. The valuation of cryptocurrencies may fluctuate, and as a result, clients may lose more than their original investment. 
          </p>
        </div>
      </div>
    </footer>
  );
}