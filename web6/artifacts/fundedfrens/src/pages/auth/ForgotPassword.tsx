import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'wouter';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { CheckCircle2 } from 'lucide-react';

const resetSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export default function ForgotPassword() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: {
      email: '',
    },
  });

  async function onSubmit(data: z.infer<typeof resetSchema>) {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      
      setIsSuccess(true);
    } catch (error: any) {
      toast({
        title: "Reset failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <AuthLayout>
        <div className="text-center py-6">
          <div className="mx-auto w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Check your email</h2>
          <p className="text-sm text-muted-foreground mt-4 mb-8 leading-relaxed">
            If an account exists for <span className="text-white font-medium">{form.getValues().email}</span>, 
            we've sent a password reset link.
          </p>
          <Button asChild variant="outline" className="w-full border-white/10 hover:bg-white/5">
            <Link href="/login">Return to login</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">Reset password</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Enter your email and we'll send you a link to reset your password.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email address</FormLabel>
                <FormControl>
                  <Input 
                    type="email" 
                    placeholder="trader@example.com" 
                    className="bg-black/50 border-white/10 text-white placeholder:text-muted-foreground/50 focus-visible:ring-primary focus-visible:border-primary"
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button 
            type="submit" 
            className="w-full bg-primary text-black hover:bg-primary/90 font-semibold mt-6"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Sending link..." : "Send reset link"}
          </Button>
          
          <div className="text-center mt-4">
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors">
              Back to sign in
            </Link>
          </div>
        </form>
      </Form>
    </AuthLayout>
  );
}