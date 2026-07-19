import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-[#0a0a0b] text-foreground relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-background to-background z-0" />
      
      <div className="text-center relative z-10">
        <h1 className="text-9xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-white/20 mb-4">
          404
        </h1>
        <h2 className="text-2xl font-bold tracking-tight text-white mb-4">
          Page not found
        </h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          The page you are looking for doesn't exist or has been moved. Check the URL or return home.
        </p>
        <div className="flex gap-4 justify-center">
          <Button asChild className="bg-primary text-black hover:bg-primary/90 font-bold px-8">
            <Link href="/">Return Home</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/10 hover:bg-white/5">
            <Link href="/challenge-plans">View Plans</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}