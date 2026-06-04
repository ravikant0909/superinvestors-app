import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About & Methodology — SuperInvestors',
  description:
    'What SuperInvestors tracks, where the data comes from (SEC EDGAR 13F filings), how returns and cost basis are estimated, and the limitations of 13F data.',
}

const coverage = [
  {
    stat: '149',
    label: 'tracked investor profiles',
    detail:
      'Notable investors and funds with a profile page on the site.',
  },
  {
    stat: '83',
    label: 'with loaded 13F history',
    detail:
      'Profiles backed by parsed SEC 13F-HR filings and quarter-over-quarter holdings.',
  },
  {
    stat: '~8,000',
    label: 'all 13F filers (coming)',
    detail:
      'A directory of every institutional manager that files a 13F-HR is being added.',
  },
]

const methodology = [
  {
    title: 'Estimated trade prices',
    detail:
      'A 13F shows position value and share count at each quarter-end, but not the price at which shares were bought or sold. To estimate the price paid for a quarter’s change in shares, we use the quarter mean: the midpoint of the consecutive quarter-end value-per-share marks. This is an approximation, not the investor’s actual fill price.',
  },
  {
    title: 'Running-average cost basis',
    detail:
      'Cost basis for a position is tracked as a running average. Each quarter’s estimated buys raise the average cost; sells reduce shares at the prevailing average. This produces an approximate, evolving cost basis from public filings alone.',
  },
  {
    title: 'Returns vs the S&P 500',
    detail:
      'Position and portfolio returns are benchmarked against the S&P 500 over the same period, so performance is shown relative to simply owning the index rather than in isolation.',
  },
  {
    title: 'Stock-split adjusted',
    detail:
      'Share counts and per-share figures are adjusted for stock splits so that quarter-over-quarter comparisons and cost-basis math stay consistent across split events.',
  },
]

const limitations = [
  {
    title: 'Long US equity only',
    detail:
      'A 13F discloses only long positions in US-listed securities (stocks, ETFs, certain options, and convertibles). Short positions, bonds, private investments, real estate, cash, and most derivatives are invisible. An investor’s 13F may represent only part of their total portfolio.',
  },
  {
    title: '~45-day reporting delay',
    detail:
      'Holdings are reported as of quarter-end, but filings are due roughly 45 days later. By the time the data is public, positions may already have changed.',
  },
  {
    title: 'Quarterly snapshots only',
    detail:
      '13F is a quarterly snapshot. Intra-quarter trades that open and close before a quarter-end never appear, and the timing of any change within the quarter is unknown.',
  },
  {
    title: 'No shorts, options intent, or non-US holdings',
    detail:
      'Short books, the directional intent behind options, and securities listed only on non-US exchanges are not disclosed. Managers with significant international or hedged exposure have incomplete 13F disclosure.',
  },
  {
    title: 'Estimates, not actuals',
    detail:
      'Estimated trade prices, running-average cost basis, and derived returns are approximations built from quarter-end marks. They are labeled as estimates and should not be read as the investor’s realized prices or returns.',
  },
  {
    title: 'Not investment advice',
    detail:
      'This is an educational and research tool. Nothing here is investment advice, a recommendation, or a solicitation. The fact that a notable investor owns a stock does not mean you should — their horizon, risk tolerance, and information set differ from yours.',
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
          A tracker for what notable investors hold, built from their SEC 13F
          filings.
        </p>
      </div>

      {/* Section 1: What it is */}
      <section className="mb-14">
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            What is SuperInvestors?
          </h2>
          <div className="space-y-4 text-gray-700 leading-relaxed">
            <p>
              SuperInvestors tracks what notable investors hold, drawn directly
              from their SEC 13F filings. Every quarter, institutional
              investment managers with over $100M in qualifying US assets must
              disclose their long US equity holdings. We collect, parse, and
              organize these filings so you can see what each tracked investor
              owns and how their positions change quarter over quarter.
            </p>
            <p>
              On top of that filing data, the site is growing an emerging layer
              of AI-assisted, per-stock research — context on individual
              positions to help you study them, not tips to act on.
            </p>
            <p>
              It is built for people who want to understand how respected
              capital allocators are positioned, using the official public
              record rather than rumor or marketing.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Data source */}
      <section className="mb-14" id="methodology">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Data Source</h2>
        <p className="text-gray-600 mb-6 leading-relaxed">
          All portfolio data comes from SEC EDGAR 13F-HR filings &mdash; the
          official, legally mandated disclosure of institutional holdings.
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">
                What is a 13F filing?
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                SEC Form 13F-HR is a quarterly report filed by institutional
                investment managers with at least $100 million in qualifying
                assets. It discloses long positions in US-listed securities
                &mdash; stocks, ETFs, certain options, and convertibles &mdash;
                held at the end of each calendar quarter.
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
                    <p className="font-semibold text-gray-900">
                      Filing deadline
                    </p>
                    <p className="text-gray-600">
                      ~45 calendar days after quarter end
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Frequency</p>
                    <p className="text-gray-600">Quarterly</p>
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
                  <span>Long positions in US-listed common and preferred stocks</span>
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
                using each filer&apos;s CIK (Central Index Key). Filings are
                parsed, holdings are extracted, and position changes are computed
                by comparing each quarter to the previous one.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Coverage */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Coverage</h2>
        <p className="text-gray-600 mb-6 leading-relaxed">
          Not every notable investor files a US 13F. We&apos;re explicit about
          the gap between the profiles we track and the ones with loaded filing
          history.
        </p>

        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          {coverage.map((c) => (
            <div
              key={c.label}
              className="bg-white rounded-xl border border-gray-200 p-6"
            >
              <p className="text-3xl font-bold text-gray-900 mb-1">{c.stat}</p>
              <p className="text-sm font-semibold text-gray-800 mb-2">
                {c.label}
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">
                {c.detail}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-700 leading-relaxed">
            Many tracked profiles genuinely don&apos;t file US 13Fs &mdash;
            non-US managers, historical figures, endowments, VC/PE firms, and
            individuals whose holdings sit inside another filer. Those profiles
            are kept for context and labeled as profile-only, not presented as
            having filing coverage they lack. A directory of all{' '}
            <span className="whitespace-nowrap">~8,000</span> institutional 13F
            filers is being added so the full universe is searchable.
          </p>
        </div>
      </section>

      {/* Section 4: Methodology */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Methodology</h2>
        <p className="text-gray-600 mb-6 leading-relaxed">
          13F filings report position value and share count, but not the prices
          an investor actually paid. We estimate trade prices, cost basis, and
          returns from quarter-end marks. These are approximations, labeled as
          estimates throughout the site.
        </p>

        <div className="space-y-4">
          {methodology.map((m) => (
            <div
              key={m.title}
              className="bg-white rounded-xl border border-gray-200 p-6"
            >
              <h3 className="text-base font-semibold text-gray-900 mb-2">
                {m.title}
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                {m.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 5: Limitations */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Limitations</h2>
        <p className="text-gray-600 mb-6 leading-relaxed">
          13F filings are the best publicly available window into institutional
          portfolios, but they have significant blind spots. Understanding these
          limitations is essential for using the data responsibly.
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

      {/* Section 6: Not Investment Advice */}
      <section className="mb-8">
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-8">
          <h2 className="text-lg font-semibold text-amber-900 mb-3">
            Not Investment Advice
          </h2>
          <div className="text-sm text-amber-800 leading-relaxed space-y-3">
            <p>
              SuperInvestors is an educational and research tool. Nothing on this
              site constitutes investment advice, a recommendation to buy or sell
              any security, or a solicitation of any kind. The fact that a
              notable investor owns a stock does not mean you should buy it
              &mdash; they may have a different time horizon, risk tolerance,
              portfolio context, or information set than you do.
            </p>
            <p>
              13F filings are backward-looking, long-US-equity-only snapshots
              with a roughly 45-day delay. Positions may have been sold by the
              time you see the data, and shorts, options intent, and non-US
              holdings are not disclosed at all. Estimated prices, cost basis,
              and returns are derived approximations, not realized figures.
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
