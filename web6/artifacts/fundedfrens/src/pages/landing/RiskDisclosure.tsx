export default function RiskDisclosure() {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 prose prose-invert prose-primary">
      <h1 className="text-4xl font-bold mb-8 text-red-500">Risk Disclosure</h1>
      <p className="text-muted-foreground mb-8">Last updated: October 1, 2023</p>

      <div className="p-6 border border-red-500/30 bg-red-500/10 rounded-lg mb-8">
        <p className="font-bold text-red-400 m-0">
          TRADING CRYPTOCURRENCIES CARRIES A HIGH LEVEL OF RISK AND MAY NOT BE SUITABLE FOR ALL INVESTORS.
        </p>
      </div>

      <p>
        This is a placeholder for the Risk Disclosure. In a real production application, this page would contain legally required disclosures regarding the risks of trading.
      </p>

      <h2>1. Simulated Environment</h2>
      <p>
        The evaluation phase (Challenge) takes place in a simulated trading environment. The performance results generated during this phase do not represent actual trading with real capital and may not reflect the impact of liquidity, slippage, and other market factors that occur in real-world trading.
      </p>

      <h2>2. High Risk Investment</h2>
      <p>
        Trading cryptocurrencies on margin involves high risk. The high degree of leverage can work against you as well as for you. Before deciding to trade cryptocurrencies, you should carefully consider your investment objectives, level of experience, and risk appetite.
      </p>

      <h2>3. Loss of Funds</h2>
      <p>
        There is a possibility that you may sustain a loss of some or all of your initial evaluation fee. You should not participate in the Challenge with money that you cannot afford to lose.
      </p>

      <h2>4. No Investment Advice</h2>
      <p>
        FundedFrens does not provide investment, financial, tax, or legal advice. Any information provided on this website or through our services is for educational and evaluation purposes only and should not be construed as investment advice.
      </p>

      <h2>5. Market Volatility</h2>
      <p>
        Cryptocurrency markets are highly volatile and unpredictable. Prices can fluctuate significantly in a short period. You must be aware of the risks and be willing to accept them in order to trade in these markets.
      </p>
    </div>
  );
}