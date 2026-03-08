# SuperInvestors App

## Overview

SuperInvestors is a standalone investment research platform tracking ~150 value investors' 13F portfolio holdings, buy/sell changes, cross-investor overlap ("best ideas"), and deep-dive conviction bet analyses. Competing with Dataroma and WhaleWisdom.

**GitHub**: https://github.com/ravikant0909/superinvestors-app
**Deploy**: Cloudflare Pages (static export)

## Git Worktrees

**Always use a separate git worktree for each Claude Code session.** Never work directly on `main`. This prevents conflicts when multiple sessions run in parallel.

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS v4 + PostCSS
- **Database**: SQLite via better-sqlite3 + Drizzle ORM schema
- **Data Pipeline**: Python 3 (SEC EDGAR 13F fetcher)
- **Build**: Static export (`output: 'export'` in next.config.js)
- **Deploy**: Cloudflare Pages
- **Node**: v24.12.0

## Directory Structure

```
superinvestors-app/
├── src/                          # Next.js source
│   ├── app/                      # App Router pages
│   ├── components/               # SVG chart components
│   └── lib/                      # db.ts, portfolio-data.ts
├── data/                         # Python data pipeline
│   ├── config.py                 # Investor registry with CIKs
│   ├── run_pipeline.py           # CLI entry point
│   ├── fetcher_13f.py            # SEC EDGAR 13F fetcher
│   ├── cusip_mapper.py           # CUSIP → ticker resolution
│   ├── position_tracker.py       # Quarter-over-quarter changes
│   ├── check_new_filings.py      # Cron-based filing monitor
│   ├── output/                   # Processed 13F JSON files
│   └── investors/                # Investor profile data
│       └── all_investors_ranked.json
├── conviction_data/              # Conviction bet analysis JSONs
├── db/schema.ts                  # Drizzle ORM schema
├── superinvestors.db             # SQLite database
├── schema.sql                    # SQL schema
├── seed_db.py                    # Seeds investors from JSON
└── load_13f_to_db.py             # Loads 13F data into SQLite
```

## Commands

```bash
# Development
npm run dev                       # Start dev server at localhost:3000
npm run build                     # Static export to out/

# Data Pipeline
cd data && python run_pipeline.py --all       # Fetch all 13F filings from SEC EDGAR
cd data && python run_pipeline.py --list      # List tracked investors
python seed_db.py                             # Seed investor profiles into SQLite
python load_13f_to_db.py                      # Load 13F data into SQLite

# Deploy
npm run build && npx wrangler pages deploy out --project-name=superinvestors-app
```

## Design System

- Light/white background, dark text
- Purple accent: #6366f1
- Font: system font stack
- Cards: white with border-gray-200, rounded-xl, shadow-sm

## Data Sources

All data comes from **SEC EDGAR** (free, no API key needed). User-Agent: `"SuperInvestors Research ravikant0909@gmail.com"` (in `data/config.py`).

## Investor Scoring System

Each investor is scored 1-10 on 8 dimensions:
1. **Philosophy Alignment** (20%) — Concentrated, long-term, downside-focused
2. **Concentration** (15%) — Fewer positions = better signal
3. **Rationality** (15%) — Evidence-based, intellectually honest
4. **Integrity** (15%) — Eat their own cooking, not fee-extractors
5. **Track Record** (15%) — Long-term outperformance vs S&P 500
6. **Transparency** (10%) — Share reasoning publicly
7. **Relevance** (5%) — Picks in our investable universe
8. **AGI Awareness** (5%) — Think about technological disruption

**Combined Score** = weighted average of the above.

Verdicts: `FOLLOW` (actively track) / `WATCH` (monitor) / `SKIP` (not relevant)

## Conviction Bets

Positions where an investor has >10% of their portfolio in a single stock. These represent the highest-conviction ideas and get deep-dive analysis with:
- Thesis summary and headline
- Valuation math with SVG waterfall/flow diagrams
- Key metrics, moat sources, risks, catalysts
- Investor quotes in their own words

## Investment Philosophy Context

The app is built around tracking investors whose philosophy aligns with ours:
- **Concentrated portfolios**, long-term holding, focus on downside protection
- **Philosophy over performance** — we care more about process than outcomes
- **No quants, no macro, no momentum** — only fundamental, analytical investors
- **AGI-aware** — every analysis assumes AGI by 2030
