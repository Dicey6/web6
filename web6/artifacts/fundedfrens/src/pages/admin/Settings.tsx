import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings as SettingsIcon, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminSettings() {
  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Platform Settings</h1>
        <p className="text-muted-foreground mt-1">Configure global platform variables and integrations.</p>
      </div>

      <Card className="glass-card border-white/10 max-w-2xl mx-auto mt-12 border-t-amber-500 border-t-2">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
          <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-6">
            <SettingsIcon className="h-10 w-10 text-amber-500" />
          </div>
          <CardTitle className="text-2xl mb-4">Configuration Portal</CardTitle>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Global settings including treasury wallet configurations, API integrations, and feature flags are managed directly via environment variables and the database to ensure maximum security.
          </p>
          
          <div className="w-full bg-black/40 border border-white/5 rounded-lg p-4 text-left mb-6">
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Administrative Notice
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              To update the main Treasury Wallet address where all SOL payments are received, please contact the development team to update the VITE_TREASURY_WALLET environment variable. This ensures payments are secure and cannot be redirected via a compromised UI session.
            </p>
          </div>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}