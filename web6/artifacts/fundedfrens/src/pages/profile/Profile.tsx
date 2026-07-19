import { useGetMyProfile, useUpdateMyProfile } from '@workspace/api-client-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, User, Wallet } from 'lucide-react';

const profileSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").optional().or(z.literal('')),
  wallet_address: z.string().min(32, "Invalid Solana address").optional().or(z.literal('')),
});

export default function Profile() {
  const { data: profile, isLoading } = useGetMyProfile();
  const updateProfile = useUpdateMyProfile();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    values: {
      username: profile?.username || '',
      wallet_address: profile?.wallet_address || '',
    },
  });

  const onSubmit = (data: z.infer<typeof profileSchema>) => {
    updateProfile.mutate({
      data: {
        username: data.username || undefined,
        wallet_address: data.wallet_address || undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Profile updated", description: "Your changes have been saved." });
      },
      onError: (err: any) => {
        toast({ title: "Update failed", description: err.message || "Failed to update profile", variant: "destructive" });
      }
    });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Profile</h1>
        
        <Card className="glass-card border-white/10">
          <CardHeader className="border-b border-white/5 pb-6">
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Update your profile details and wallet address.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="mb-8 flex items-center gap-4 p-4 rounded-xl bg-black/30 border border-white/5">
              <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="h-8 w-8 text-primary" />
              </div>
              <div>
                <div className="text-lg font-bold text-white">{profile?.email}</div>
                <div className="text-sm text-muted-foreground">User ID: {profile?.id}</div>
              </div>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="Enter username" className="pl-9 bg-black/50 border-white/10" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="wallet_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Solana Payout Wallet</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Wallet className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="Solana address for payouts" className="pl-9 bg-black/50 border-white/10 font-mono text-sm" {...field} />
                        </div>
                      </FormControl>
                      <FormDescription>This address will be used to send your funded account profits and referral payouts.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="pt-4 border-t border-white/5 flex justify-end">
                  <Button 
                    type="submit" 
                    className="bg-primary text-black hover:bg-primary/90"
                    disabled={updateProfile.isPending || !form.formState.isDirty}
                  >
                    {updateProfile.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

// Needed for the generic import to work
import { FormDescription } from '@/components/ui/form';