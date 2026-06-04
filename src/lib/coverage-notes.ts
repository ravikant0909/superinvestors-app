// Why a tracked investor has no 13F holdings in the dataset. Many roster profiles
// genuinely cannot be 13F-covered (non-US managers, historical figures, endowments,
// VCs/PE, individuals, or people whose holdings sit inside another filer). This map
// gives each a specific, honest reason shown on the profile-only page instead of a
// generic "no data" banner. Slugs that DO have 13F data simply won't read from this.

export const COVERAGE_NOTES: Record<string, string> = {
  // --- Holdings reported inside another tracked filer ---
  'ted-weschler': "Holdings are reported inside Berkshire Hathaway's 13F, not separately.",
  'todd-combs': "Holdings are reported inside Berkshire Hathaway's 13F, not separately.",
  'bruce-karsh': 'Holdings are reported under Oaktree Capital Management (see Howard Marks).',
  'jean-marie-eveillard': 'Holdings are reported under First Eagle Investments (see Matthew McLennan).',
  'david-herro': 'Holdings are reported under Harris Associates (see Bill Nygren); Herro runs Oakmark International.',

  // --- Non-US managers (do not file SEC 13F, or holdings are mostly non-US) ---
  'francisco-garcia-parames': 'Spain-based (Cobas) — does not file a US 13F.',
  'edouard-carmignac': 'France-based (Carmignac) — does not file a US 13F.',
  'hamish-douglass': 'Australia-based (Magellan) — does not file a US 13F.',
  'kerr-neilson': 'Australia-based (Platinum) — does not file a US 13F.',
  'cheah-cheng-hye': 'Hong Kong-based (Value Partners) — does not file a US 13F.',
  'v-nee-yeh': 'Hong Kong-based (Value Partners) — does not file a US 13F.',
  'shuhei-abe': 'Japan-based (Sparx) — does not file a US 13F.',
  'teng-ngiek-lian': 'Singapore-based (Target Asset Mgmt) — does not file a US 13F.',
  'wong-kok-hoi': 'Singapore-based (APS) — does not file a US 13F.',
  'mark-mobius': 'Emerging-markets manager (Mobius Capital) — does not file a US 13F.',
  'robert-chicken': 'Canada-based (Beutel Goodman) — does not file a US 13F.',
  'jean-jacques-durand': 'Belgium-based (Compagnie du Bois Sauvage) — does not file a US 13F.',
  'robert-vinall': 'Switzerland-based (RV Capital) — files a US 13F only sporadically.',
  'nick-train': 'UK-based (Lindsell Train) — 13F holdings are mostly non-US; not tracked.',

  // --- Historical / deceased figures ---
  'benjamin-graham': 'Historical figure (d. 1976) — included for his frameworks.',
  'john-templeton': 'Historical figure (d. 2008) — ran the Templeton Growth Fund.',
  'philip-fisher': 'Historical figure (d. 2004) — included for his frameworks.',
  'walter-schloss': 'Historical figure (d. 2012) — Graham-lineage deep value.',
  'peter-cundill': 'Historical figure (d. 2011) — global deep value.',
  't-boone-pickens': 'Historical figure (d. 2019) — energy-focused activist.',
  'sam-zell': 'Historical figure (d. 2023) — real-estate / distressed.',
  'john-neff': 'Historical — ran the Vanguard Windsor mutual fund (retired 1995).',
  'peter-lynch': 'Historical — ran the Fidelity Magellan mutual fund (retired 1990).',

  // --- Retired / fund wound down or closed ---
  'julian-robertson': 'Tiger Management wound down (Robertson d. 2022); no current 13F.',
  'anthony-bolton': 'Retired from Fidelity International; no current 13F.',
  'nick-sleep': 'Nomad Partnership wound down in 2014; no current 13F.',
  'jim-rogers': 'Individual macro investor (Rogers Holdings); no 13F.',
  'john-arnold': 'Retired from trading (Centaurus); now focused on philanthropy.',
  'john-griffin': 'Blue Ridge Capital returned outside capital (2017); no current 13F.',
  'neil-woodford': 'Woodford Investment Management collapsed (2019); UK manager.',
  'whitney-tilson': 'Closed his fund (2017); now runs investment education/newsletters.',
  'allan-mecham': 'Arlington Value returned outside capital (~2020); no longer files.',
  'wilbur-ross': 'WL Ross folded into Invesco; later US Commerce Secretary. No tracked 13F.',
  'ian-cumming-joe-steinberg': 'Leucadia is now Jefferies Financial Group; historical profile.',

  // --- Endowments / foundations (invest via external managers; no direct 13F) ---
  'david-swensen': 'Yale endowment (d. 2021) — endowments invest via external managers; no 13F.',
  'jane-mendillo': 'Former Harvard endowment CIO — endowments do not file 13F.',
  'seth-alexander': 'MIT endowment (MITIMCo) — endowments do not file 13F.',
  'scott-malpass': 'Former Notre Dame endowment CIO — endowments do not file 13F.',
  'kim-lew': 'Columbia endowment CIO — endowments do not file 13F.',

  // --- Venture capital / private equity / private companies ---
  'marc-andreessen-ben-horowitz': 'Venture capital (a16z) — primarily private holdings; no conventional 13F.',
  'bill-gurley': 'Venture capital (Benchmark) — private holdings; no 13F.',
  'chamath-palihapitiya': 'Venture / SPACs (Social Capital) — no conventional 13F.',
  'john-collison-patrick-collison': 'Stripe founders — private company; no public 13F.',
  'orlando-bravo': 'Private equity (Thoma Bravo, software) — no public-equity 13F.',
  'egon-durban': 'Private equity (Silver Lake, tech) — no public-equity 13F.',
  'david-bonderman': 'Private equity (TPG) — no public-equity 13F.',
  'henry-kravis-george-roberts': 'Private equity (KKR) — public-equity 13F is negligible.',
  'stephen-schwarzman': 'Private equity (Blackstone) — public-equity 13F is negligible.',
  'barry-sternlicht': 'Real-estate / private equity (Starwood) — negligible US-equity 13F.',
  'marc-lasry': 'Credit / distressed (Avenue Capital) — negligible US-equity 13F.',
  'loews-corporation-tisch-family': 'Operating conglomerate (Loews) — not a 13F portfolio manager.',
  'howard-lutnick': 'Broker-dealer (Cantor/BGC); later US Commerce Secretary. No tracked 13F.',

  // --- Individuals / academics / strategists (no fund that files 13F) ---
  'aswath-damodaran': 'Academic (NYU Stern) — runs no fund; profile is for his valuation work.',
  'michael-mauboussin': 'Strategist/author (Counterpoint Global) — not a standalone 13F filer.',
  'mark-cuban': 'Individual investor — no fund that files a 13F.',
  'michael-saylor': 'Bitcoin treasury (MicroStrategy/Strategy) — no US-equity 13F.',

  // --- Mutual-fund managers (filed under a parent, not separately tracked) ---
  'will-danoff': 'Runs the Fidelity Contrafund — filed under FMR, not separately.',

  // --- Small funds we may add later ---
  'guy-spier': 'Aquamarine Capital — small, sporadic 13F; not yet tracked.',
  'jake-rosser': 'Coho Capital — small fund; not yet tracked.',
  'jake-taylor': 'Farnam Street — very small book; profile is for his writing.',
  'tobias-carlisle': 'Acquirers Funds — small ETF complex; not yet tracked.',
}

export function coverageNote(slug: string): string | null {
  return COVERAGE_NOTES[slug] ?? null
}
