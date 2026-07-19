import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export default function FAQ() {
  const faqs = [
    {
      category: "Getting Started & Rules",
      items: [
        {
          q: "How do I get funded?",
          a: "Create an account, select a challenge plan, pay the one-time evaluation fee in SOL, and prove your trading edge by hitting the profit target while respecting the risk rules."
        },
        {
          q: "What happens if I fail?",
          a: "If you violate a risk rule (e.g., maximum drawdown, daily loss limit), the challenge is failed. Your account will be frozen, but you can reactivate it for 40% of the original challenge price and try again."
        },
        {
          q: "Can I hold overnight?",
          a: "Yes. We do not restrict overnight holding. You are free to hold positions overnight and over the weekends, taking advantage of the 24/7 crypto market."
        },
        {
          q: "Can I trade anytime?",
          a: "Yes. Crypto markets never sleep, and neither do we. Trading is available 24 hours a day, 7 days a week."
        },
        {
          q: "Which launchpads are supported?",
          a: "We support all Solana launchpads. You can trade any token available on the Solana ecosystem as long as you adhere strictly to the position sizing and drawdown limits."
        }
      ]
    },
    {
      category: "Payments & Payouts",
      items: [
        {
          q: "How do payouts work?",
          a: "Once you are funded, you can request a payout of your profits. Payouts are settled on-chain directly to your Solana wallet. The first payout is available 14 days after your first funded trade, and bi-weekly thereafter."
        },
        {
          q: "How are payments verified?",
          a: "Payments for challenges are verified automatically on-chain. When you send SOL to the provided address at checkout, our system detects the transaction within seconds and activates your evaluation account."
        },
        {
          q: "How do referrals work?",
          a: "Every user receives a unique referral code. When a new user registers using your code and purchases a challenge, you earn a commission. Earnings are tracked in your dashboard and paid out in USDC or SOL upon request."
        },
        {
          q: "Do I need KYC?",
          a: "KYC is NOT required during the evaluation phase. It is only required when you pass the evaluation and are ready to be onboarded as a live funded trader to receive actual firm capital."
        }
      ]
    },
    {
      category: "Platform & Tracking",
      items: [
        {
          q: "How is my performance tracked?",
          a: "Our proprietary terminal tracks every trade you execute in real-time. We monitor Entry/Exit points, PnL %, Hold Time, Position Size, Peak Unrealized Profit, Maximum Adverse Excursion, and overall Risk Taken. All of this is visible in your dashboard."
        }
      ]
    }
  ];

  return (
    <div className="w-full min-h-screen bg-[#0a0a0b] py-24">
      <div className="w-full max-w-4xl mx-auto px-6 lg:px-8">
        <div className="text-center mb-20">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-6 text-white">Knowledge Base</h1>
          <p className="text-lg md:text-xl text-muted-foreground">Everything you need to know about trading our capital.</p>
        </div>

        <div className="space-y-16">
          {faqs.map((group, idx) => (
            <div key={idx} className="glass-panel border-white/5 rounded-3xl p-6 md:p-10 bg-black/40">
              <h2 className="text-2xl font-black mb-8 text-white flex items-center gap-3">
                <div className="w-2 h-6 bg-primary rounded-full" />
                {group.category}
              </h2>
              <Accordion type="multiple" className="w-full space-y-4">
                {group.items.map((faq, i) => (
                  <AccordionItem key={i} value={`item-${idx}-${i}`} className="border border-white/5 bg-white/[0.02] rounded-xl px-6 data-[state=open]:border-primary/20 transition-colors">
                    <AccordionTrigger className="text-left text-lg font-bold hover:text-primary transition-colors py-6 hover:no-underline">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed text-base pb-6">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}