import { useState } from 'react';
import { useGetMyProfile, useGenerateTelegramToken, useUnlinkTelegram } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { Shield, Mail, Key, LogOut, MessageSquare, CheckCircle2, AlertCircle, Copy, RefreshCw, Unlink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Settings() {
  const { data: profile, refetch: refetchProfile } = useGetMyProfile();
  const { signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [telegramToken, setTelegramToken] = useState<{ token: string; expires_at: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const { mutate: generateToken, isPending: isGenerating } = useGenerateTelegramToken({
    mutation: {
      onSuccess: (data) => {
        setTelegramToken(data);
        toast({ title: 'Token Generated', description: 'Send this code to the FundedFrens Telegram bot using /link' });
      },
      onError: () => {
        toast({ title: 'Error', description: 'Failed to generate token. Please try again.', variant: 'destructive' });
      },
    },
  });

  const { mutate: unlinkTelegram, isPending: isUnlinking } = useUnlinkTelegram({
    mutation: {
      onSuccess: () => {
        setTelegramToken(null);
        queryClient.invalidateQueries({ queryKey: ['/v1/users/profile'] });
        queryClient.invalidateQueries({ queryKey: ['/v1/users/dashboard'] });
        refetchProfile();
        toast({ title: 'Telegram Unlinked', description: 'Your Telegram account has been disconnected.' });
      },
      onError: () => {
        toast({ title: 'Error', description: 'Failed to unlink Telegram. Please try again.', variant: 'destructive' });
      },
    },
  });

  const copyToken = () => {
    if (telegramToken?.token) {
      navigator.clipboard.writeText(telegramToken.token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const isLinked = profile?.telegram_status === 'linked';
  const tokenExpiry = telegramToken ? new Date(telegramToken.expires_at) : null;
  const tokenValid = tokenExpiry && tokenExpiry > new Date();

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Account Settings</h1>

        <div className="space-y-6">
          {/* ── Security ─────────────────────────────────────────────────────── */}
          <Card className="glass-card border-white/10">
            <CardHeader className="border-b border-white/5 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" /> Security
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" /> Email Address
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">{profile?.email}</p>
                </div>
                <Button variant="outline" className="border-white/10" disabled>Change Email</Button>
              </div>

              <div className="pt-4 border-t border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    <Key className="h-4 w-4 text-muted-foreground" /> Password
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">Last changed: Unknown</p>
                </div>
                <Button variant="outline" className="border-white/10" disabled>Change Password</Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Telegram Linking ──────────────────────────────────────────────── */}
          <Card className="glass-card border-white/10">
            <CardHeader className="border-b border-white/5 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-400" /> Telegram
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm mt-1">
                Connect your Telegram account to receive instant trade alerts, margin warnings, and payout updates.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {isLinked ? (
                /* ── Already linked ── */
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">Telegram Connected</p>
                      {profile?.telegram_username && (
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">@{profile.telegram_username}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 h-9"
                    onClick={() => unlinkTelegram()}
                    disabled={isUnlinking}
                  >
                    <Unlink className="h-4 w-4 mr-2" />
                    {isUnlinking ? 'Unlinking…' : 'Unlink Telegram'}
                  </Button>
                </div>
              ) : (
                /* ── Not linked ── */
                <div className="space-y-5">
                  <div className="flex items-start gap-3 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
                    <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Not connected. Generate a one-time code below, then send it to the
                      {' '}<span className="text-white font-semibold">@FundedFrensBot</span>{' '}
                      on Telegram using the command <span className="font-mono text-primary">/link YOUR_CODE</span>.
                    </p>
                  </div>

                  {telegramToken && tokenValid ? (
                    /* ── Token generated ── */
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground font-mono tracking-widest uppercase">Your Link Code</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-black border border-white/10 rounded-lg px-4 py-3 font-mono text-xl font-black text-primary tracking-[0.3em] text-center select-all">
                          {telegramToken.token}
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="border-white/10 h-12 w-12 shrink-0"
                          onClick={copyToken}
                        >
                          {copiedToken ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        Expires at {format(tokenExpiry!, 'HH:mm:ss')} — send <span className="text-primary">/link {telegramToken.token}</span> to the bot before then.
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-white text-xs"
                        onClick={() => generateToken()}
                        disabled={isGenerating}
                      >
                        <RefreshCw className="h-3 w-3 mr-1.5" /> Generate New Code
                      </Button>
                    </div>
                  ) : (
                    /* ── Generate button ── */
                    <Button
                      className="bg-blue-600 hover:bg-blue-500 text-white font-semibold h-10"
                      onClick={() => generateToken()}
                      disabled={isGenerating}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      {isGenerating ? 'Generating…' : 'Generate Link Code'}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Danger Zone ──────────────────────────────────────────────────── */}
          <Card className="glass-card border-white/10">
            <CardHeader className="border-b border-white/5 pb-4">
              <CardTitle className="text-lg text-red-500">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h4 className="text-sm font-medium text-white">Sign Out</h4>
                  <p className="text-sm text-muted-foreground mt-1">Sign out of your account on this device.</p>
                </div>
                <Button variant="outline" className="border-white/10 hover:bg-white/5" onClick={() => signOut()}>
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground mt-8">
            Account created {profile?.created_at ? format(new Date(profile.created_at), 'MMMM d, yyyy') : ''}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
