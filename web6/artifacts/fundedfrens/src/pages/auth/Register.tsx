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

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function Register() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(data: z.infer<typeof registerSchema>) {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;
      
      setIsSuccess(true);
    } catch (error: any) {
      toast({
        title: "Registration failed",
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
            We've sent a verification link to <span className="text-white font-medium">{form.getValues().email}</span>. 
            Please check your inbox and click the link to verify your account.
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
        <h2 className="text-2xl font-bold tracking-tight text-white">Create an account</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline transition-all">
            Sign in
          </Link>
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

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input 
                    type="password" 
                    placeholder="At least 8 characters" 
                    className="bg-black/50 border-white/10 text-white placeholder:text-muted-foreground/50 focus-visible:ring-primary focus-visible:border-primary"
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm Password</FormLabel>
                <FormControl>
                  <Input 
                    type="password" 
                    placeholder="Confirm password" 
                    className="bg-black/50 border-white/10 text-white placeholder:text-muted-foreground/50 focus-visible:ring-primary focus-visible:border-primary"
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="text-xs text-muted-foreground pt-2">
            By registering, you agree to our <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link> and <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
          </div>

          <Button 
            type="submit" 
            className="w-full bg-primary text-black hover:bg-primary/90 font-semibold mt-4"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}