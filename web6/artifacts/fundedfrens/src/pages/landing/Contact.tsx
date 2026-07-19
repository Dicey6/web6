import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Mail, MessageSquare, Twitter } from 'lucide-react';

export default function Contact() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call for static page
    setTimeout(() => {
      setIsSubmitting(false);
      toast({
        title: "Message sent",
        description: "We've received your message and will get back to you shortly.",
      });
      (e.target as HTMLFormElement).reset();
    }, 1000);
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">Contact Us</h1>
        <p className="text-xl text-muted-foreground">
          Have a question or need support? We're here to help. Reach out to our team.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div>
          <div className="glass-panel p-8 rounded-2xl border-white/5 h-full">
            <h2 className="text-2xl font-bold mb-6">Get in Touch</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-white mb-2">Name</label>
                <Input id="name" required placeholder="Your name" className="bg-black/50 border-white/10" />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-white mb-2">Email</label>
                <Input id="email" type="email" required placeholder="your@email.com" className="bg-black/50 border-white/10" />
              </div>
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-white mb-2">Subject</label>
                <Input id="subject" required placeholder="How can we help?" className="bg-black/50 border-white/10" />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-white mb-2">Message</label>
                <Textarea id="message" required placeholder="Tell us more..." rows={5} className="bg-black/50 border-white/10 resize-none" />
              </div>
              <Button type="submit" className="w-full bg-primary text-black hover:bg-primary/90" disabled={isSubmitting}>
                {isSubmitting ? "Sending..." : "Send Message"}
              </Button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-panel p-8 rounded-2xl border-white/5 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Email Support</h3>
            <p className="text-muted-foreground mb-4">For general inquiries and account support.</p>
            <a href="mailto:support@fundedfrens.com" className="text-primary hover:underline font-medium">support@fundedfrens.com</a>
          </div>

          <div className="glass-panel p-8 rounded-2xl border-white/5 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <MessageSquare className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Discord Community</h3>
            <p className="text-muted-foreground mb-4">Join our community of traders to chat, share setups, and get fast help.</p>
            <Button asChild variant="outline" className="border-white/10">
              <a href="https://discord.com" target="_blank" rel="noreferrer">Join Discord</a>
            </Button>
          </div>

          <div className="glass-panel p-8 rounded-2xl border-white/5 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Twitter className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Twitter / X</h3>
            <p className="text-muted-foreground mb-4">Follow us for announcements, updates, and trader highlights.</p>
            <Button asChild variant="outline" className="border-white/10">
              <a href="https://twitter.com" target="_blank" rel="noreferrer">Follow @FundedFrens</a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}