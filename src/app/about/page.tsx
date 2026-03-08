import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About & Methodology — SuperInvestors',
  description: 'How we score investors, our data sources, methodology, and limitations. Learn about our 8-dimension scoring framework and verdict system.',
}

const scoringDimensions = [
  {
    name: 'Philosophy Alignment',
    weight: 20,
    description:
      'How closely does this investor\'s philosophy match concentrated, long-term, downside-first value investing? Do they buy wonderful businesses at fair prices, focus on margin of safety, and think in decades?',
    high: 'Clear, consistent philosophy focused on durable advantages and long-term compounding.',
    low: 'Momentum-driven, macro-trading, or no coherent investment framework.',
  },
  {
    name: 'Concentration',
    weight: 15,
    description:
      'Does this investor make a few big bets with high conviction, or spray capital across hundreds of positions? Concentrated portfolios produce higher-signal 13F filings.',
    high: '5-15 positions, top 5 representing 60%+ of the portfolio.',
    low: '100+ positions with no clear conviction sizing.',
  },
  {
    name: 'Rationality',
    weight: 15,
    description:
      'Evidence of clear thinking, willingness to change mind with new data, avoidance of behavioral biases, and discipline under pressure.',
    high: 'Admits mistakes publicly, holds through volatility when thesis intact, sells when thesis breaks.',
    low: 'Chases momentum, panic-sells, anchors to positions despite thesis deterioration.',
  },
  {
    name: 'Integrity',
    weight: 15,
    description:
      'Alignment with investors, honest communication, fee structure fairness, absence of scandals or self-dealing.',
    high: 'Co-invests alongside LPs, reasonable fees, returns capital when opportunities are scarce.',
    low: 'Fee extraction, misleading communication, regulatory issues, conflicts of interest.',
  },
  {
    name: 'Track Record',
    weight: 15,
    description:
      'Long-term performance versus benchmarks, measured over full market cycles (10+ years). Consistency and risk-adjusted returns matter more than peak performance.',
    high: 'Market-beating returns over 15+ years across multiple cycles with reasonable volatility.',
    low: 'Short track record, inconsistent returns, or strong performance driven by leverage/luck.',
  },
  {
    name: 'Transparency',
    weight: 10,
    description:
      'How much can we learn from this investor\'s public communications? Quality of letters, speeches, interviews, and willingness to explain reasoning.',
    high: 'Publishes detailed letters, gives talks, explains individual positions and mistakes.',
    low: 'No public letters, never speaks publicly, opaque about investment process.',
  },
  {
    name: 'Relevance',
    weight: 5,
    description:
      'Is this investor still actively managing money and making decisions? Retired, deceased, or coasting managers produce stale 13F signals.',
    high: 'Actively investing, recent high-conviction new positions, engaged in markets.',
    low: 'Retired, deceased, or fund on autopilot with no active decision-making.',
  },
  {
    name: 'AGI Awareness',
    weight: 5,
    description:
      'Does this investor understand and incorporate the implications of artificial general intelligence into their analysis? AGI will reshape most businesses by 2030.',
    high: 'Explicitly discusses AI/AGI impact on portfolio companies, positions reflect AI thesis.',
    low: 'No engagement with technological disruption, portfolio ignores AI transformation.',
  },
]

const verdicts = [
  {
    label: 'FOLLOW',
    color: 'bg-green-100 text-green-800 border-green-200',
    dotColor: 'bg-green-500',
    count: 38,
    scoreRange: '7.5+',
    description:
      'High-conviction investors whose 13F filings are worth studying in detail every quarter. Their new positions and significant increases are potential idea sources. These investors have demonstrated strong alignment with concentrated, long-term value investing and have the track records to back it up.',
  },
  {
    label: 'WATCH',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    dotColor: 'bg-yellow-500',
    count: 56,
    scoreRange: '5.0 - 7.4',
    description:
      'Interesting investors worth monitoring but with meaningful gaps in our scoring criteria. They may have excellent track records but low concentration, or great philosophy but short history. Their 13F filings provide useful context but are not primary idea sources.',
  },
  {
    label: 'SKIP',
    color: 'bg-red-100 text-red-800 border-red-200',
    dotColor: 'bg-red-500',
    count: 51,
    scoreRange: 'Below 5.0',
    description:
      'Investors who do not meet our criteria for tracking. They may be quantitative/algorithmic, excessively diversified, have integrity concerns, or follow strategies that produce low-signal 13F filings. Included in our database for completeness but not actively monitored.',
  },
]

const limitations = [
  {
    title: '13F only shows long equity positions',
    detail:
      'Short positions, bonds, private investments, real estate, derivatives (except certain options), and cash positions are invisible. An investor\'s 13F may represent only 30-50% of their total portfolio.',
  },
  {
    title: '45-day reporting delay',
    detail:
      'Holdings are reported as of quarter-end, but filings are due 45 days later. By the time we see the data, positions may have already changed significantly.',
  },
  {
    title: 'No position cost basis',
    detail:
      '13F filings show market value, not purchase price. We cannot determine whether a position is profitable or at what price the investor entered.',
  },
  {
    title: 'No short positions',
    detail:
      'Short positions are not disclosed in 13F filings. An investor may appear bullish on a sector while hedging heavily via shorts we cannot see.',
  },
  {
    title: 'No international holdings',
    detail:
      '13F only covers securities on US exchanges. Investors with significant international portfolios (e.g., Li Lu\'s BYD position) have incomplete disclosure.',
  },
  {
    title: 'Confidential treatment',
    detail:
      'Investors can request confidential treatment from the SEC for positions they are actively building, delaying disclosure by up to a year.',
  },
  {
    title: 'Attribution ambiguity',
    detail:
      'Large firms file a single 13F covering multiple portfolio managers. A position in Berkshire\'s 13F might be Buffett, Todd Combs, or Ted Weschler.',
  },
  {
    title: 'Small position noise',
    detail:
      'Positions under $200M may be analyst-level or compliance-driven rather than reflecting the lead PM\'s conviction. We focus on large, concentrated positions.',
  },
]

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          About SuperInvestors
        </h1>
        <p className="text-lg text-gray-600 leading-relaxed">
          How we track, score, and analyze the world&apos;s greatest investors.
        </p>
      </div>

      {/* Section 1: What We Do */}
      <section className="mb-14">
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            What is SuperInvestors?
          </h2>
          <div className="space-y-4 text-gray-700 leading-relaxed">
            <p>
              SuperInvestors tracks the portfolios of legendary value investors
              through their SEC 13F filings. Every quarter, institutional
              investment managers with over $100M in assets must disclose their
              US equity holdings. We collect, parse, and analyze these filings
              to show you exactly what the world&apos;s best investors are buying
              and selling.
            </p>
            <p>
              But we go further than raw data. We score each investor across 8
              dimensions to separate genuine conviction investors from asset
              gatherers. We track position changes quarter over quarter. We
              identify stocks where multiple top investors converge. And we
              generate AI-powered investment theses explaining <em>why</em> each
              investor likely holds each position.
            </p>
            <p>
              This site is built for serious individual investors, financial
              advisors, and students of value investing who want to understand
              how the greatest capital allocators think and act &mdash; not for
              short-term traders looking for tips.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Scoring System */}
      <section className="mb-14" id="methodology">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          How We Score Investors
        </h2>
        <p className="text-gray-600 mb-6 leading-relaxed">
          Every investor is scored on 8 dimensions, each rated 1&ndash;10. The
          weighted composite score determines their verdict. Weights reflect
          what matters most for generating actionable, high-signal investment
          ideas.
        </p>

        <div className="space-y-4">
          {scoringDimensions.map((dim) => (
            <div
              key={dim.name}
              className="bg-white rounded-xl border border-gray-200 p-6"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-base font-semibold text-gray-900">
                  {dim.name}
                </h3>
                <span className="text-sm font-mono font-semibold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full whitespace-nowrap ml-4">
                  {dim.weight}% weight
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed mb-3">
                {dim.description}
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">
                    Score 9-10
                  </p>
                  <p className="text-sm text-green-800">{dim.high}</p>
                </div>
                <div className="bg-red-50 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">
                    Score 1-3
                  </p>
                  <p className="text-sm text-red-800">{dim.low}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Composite formula */}
        <div className="mt-6 bg-gray-50 rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-3">
            Composite Score Formula
          </h3>
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 font-mono text-sm text-gray-800 overflow-x-auto">
            <code>
              Composite = Philosophy(20%) + Concentration(15%) +
              Rationality(15%) + Integrity(15%) + Track&nbsp;Record(15%) +
              Transparency(10%) + Relevance(5%) + AGI&nbsp;Awareness(5%)
            </code>
          </div>
          <p className="text-sm text-gray-600 mt-3">
            All scores are on a 1&ndash;10 scale. The composite is a weighted
            average, also on a 1&ndash;10 scale. Scores are based on extensive
            research into each investor&apos;s public record, writings, track
            record, and portfolio characteristics.
          </p>
        </div>
      </section>

      {/* Section 3: Verdict System */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Verdict System
        </h2>
        <p className="text-gray-600 mb-6 leading-relaxed">
          Each investor receives a verdict based on their composite score. The
          verdict determines how closely we track their portfolio activity.
        </p>

        <div className="space-y-4">
          {verdicts.map((v) => (
            <div
              key={v.label}
              className={`rounded-xl border p-6 ${v.color}`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className={`w-3 h-3 rounded-full ${v.dotColor}`} />
                <h3 className="text-lg font-bold">{v.label}</h3>
                <span className="text-sm font-mono opacity-75">
                  Score {v.scoreRange}
                </span>
                <span className="text-sm opacity-75 ml-auto">
                  {v.count} investors
                </span>
              </div>
              <p className="text-sm leading-relaxed opacity-90">
                {v.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 4: Data Sources */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Data Sources</h2>
        <p className="text-gray-600 mb-6 leading-relaxed">
          All portfolio data comes from SEC EDGAR 13F filings &mdash; the
          official, legally mandated disclosure of institutional holdings.
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">
                What is a 13F filing?
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                SEC Form 13F is a quarterly report filed by institutional
                investment managers with at least $100 million in qualifying
                assets under management. It discloses all US-listed equity
                positions (stocks, ETFs, certain options, and convertible
                securities) held at the end of each calendar quarter.
              </p>
            </div>

            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">
                Filing timeline
              </h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="font-semibold text-gray-900">Quarter ends</p>
                    <p className="text-gray-600">
                      Mar 31, Jun 30, Sep 30, Dec 31
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Filing deadline</p>
                    <p className="text-gray-600">
                      45 calendar days after quarter end
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Our processing</p>
                    <p className="text-gray-600">
                      Within 24 hours of filing
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">
                What&apos;s included
              </h3>
              <ul className="text-sm text-gray-700 leading-relaxed space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 font-bold">+</span>
                  <span>US-listed common and preferred stocks</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 font-bold">+</span>
                  <span>ETFs and closed-end funds</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 font-bold">+</span>
                  <span>Equity options (puts and calls on specific stocks)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 font-bold">+</span>
                  <span>Convertible debt securities</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 font-bold">+</span>
                  <span>
                    Share count, market value, and investment discretion per
                    position
                  </span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">
                Data pipeline
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                We fetch 13F XML filings directly from{' '}
                <a
                  href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=13F&dateb=&owner=include&count=40"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  SEC EDGAR
                </a>{' '}
                using each investor&apos;s CIK (Central Index Key). Filings are
                parsed, holdings are extracted, position changes are computed by
                comparing to the previous quarter, and cross-investor overlap is
                updated. AI theses are generated using Claude for significant
                position changes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: Limitations */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Limitations</h2>
        <p className="text-gray-600 mb-6 leading-relaxed">
          13F filings are the best publicly available window into institutional
          portfolios, but they have significant blind spots. Understanding these
          limitations is essential for using this data responsibly.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          {limitations.map((lim) => (
            <div
              key={lim.title}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                {lim.title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {lim.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 6: Methodology Note */}
      <section className="mb-8">
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-8">
          <h2 className="text-lg font-semibold text-amber-900 mb-3">
            Not Investment Advice
          </h2>
          <div className="text-sm text-amber-800 leading-relaxed space-y-3">
            <p>
              SuperInvestors is an educational and research tool. Nothing on this
              site constitutes investment advice, a recommendation to buy or
              sell any security, or a solicitation of any kind. The fact that a
              legendary investor owns a stock does not mean you should buy it
              &mdash; they may have a different time horizon, risk tolerance,
              portfolio context, or information set than you do.
            </p>
            <p>
              13F filings are backward-looking snapshots with a 45-day delay.
              Positions may have been sold by the time you see the data. Our
              investor scores are editorial assessments based on publicly
              available information and reflect our analytical framework, not
              objective truth. AI-generated theses are speculative
              interpretations, not statements of fact.
            </p>
            <p>
              Always do your own research. Never invest based solely on what
              someone else is buying. Understand a business before you own it.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
