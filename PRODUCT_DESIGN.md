# SuperInvestors — Product Design Document

**Version:** 1.0
**Date:** 2026-03-04
**Status:** Ready for Implementation

---

## 1. Product Overview

SuperInvestors is a web application that tracks the portfolios of ~40 legendary value investors via their SEC 13F filings. It provides AI-generated investment theses, deep investor profiles, cross-investor analysis, and a curated "best ideas" list. Think of it as a dramatically better version of dataroma.com.

### Core Value Proposition
- **For individual investors** who follow value investing legends and want to see what they're buying/selling
- **Differentiated by**: AI-generated theses, deep investor profiles with philosophy scoring, cross-investor overlap analysis, and modern UI
- **Updated quarterly** as 13F filings are published (within 24 hours of filing)

---

## 2. Target Users

1. **Individual value investors** — Follow Buffett, Klarman, Pabrai et al. Want to see positions and understand reasoning
2. **Financial advisors** — Use as research tool to identify high-conviction ideas
3. **Finance students** — Study legendary investors' approaches and portfolio construction
4. **Investment bloggers/analysts** — Source material for content creation

---

## 3. Competitive Analysis

### What's Wrong with Existing Products

| Feature | Dataroma | GuruFocus | WhaleWisdom | **SuperInvestors** |
|---------|----------|-----------|-------------|-------------------|
| UI Quality | 2005-era | Cluttered | Dated | Modern, clean |
| Investor Profiles | Minimal | Basic bio | None | Deep philosophy + scoring |
| AI Theses | None | None | None | Per-position thesis |
| Cross-Investor Analysis | Basic overlap | Some | None | Full overlap matrix + best ideas |
| Free Tier | Yes | Limited | Limited | Yes (core features) |
| Mobile | Poor | OK | Poor | Fully responsive |
| Speed | Slow | Slow | OK | Fast (SSR + edge) |

### Our Advantages
1. **AI-generated investment theses** — No competitor does this
2. **Investor quality scoring** — 8-dimension framework, not just a list of names
3. **Curated "best ideas"** — Weighted by investor quality, not just overlap count
4. **Beautiful modern UI** — Clean, data-dense, fast
5. **Deep investor profiles** — Philosophy, career timeline, letters, interviews

---

## 4. Information Architecture

### Pages

```
/                          Home / Dashboard
/investors                 All tracked investors (grid/list)
/investors/[slug]          Individual investor profile
/stocks                    All stocks held by tracked investors
/stocks/[ticker]           Individual stock page (who owns it)
/changes                   Latest position changes feed
/best-ideas                Our curated top investment ideas
/overlap                   Cross-investor analysis
/about                     Methodology, scoring, data sources
```

---

## 5. Page-by-Page Design

### 5.1 Home Page (/)

**Purpose:** Quick overview, draw users in, show latest activity.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  [Logo: SuperInvestors]            [Investors] [Changes] [Best Ideas]│
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Track the World's Greatest Investors                                │
│  See what 38 legendary value investors are buying and selling.       │
│  [Browse Investors →]    [Latest Changes →]                          │
│                                                                      │
├──────────────────────┬──────────────────────────────────────────────┤
│  QUICK STATS          │  LATEST CHANGES                              │
│  ┌────────────────┐   │  ┌────────────────────────────────────────┐  │
│  │ 38 Investors   │   │  │ 🟢 Pabrai BOUGHT Micron (MU)         │  │
│  │ 1,247 Positions│   │  │ 🔴 Klarman SOLD eBay (EBAY)          │  │
│  │ 89 Stocks      │   │  │ 🔵 Hohn INCREASED Visa (V)           │  │
│  │ Updated 2/15   │   │  │ 🟢 Buffett BOUGHT Constellation      │  │
│  └────────────────┘   │  │ 🔴 Tepper DECREASED NVDA              │  │
│                        │  └────────────────────────────────────────┘  │
├────────────────────────┴─────────────────────────────────────────────┤
│  TOP IDEAS — Stocks held by multiple top investors                    │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ 1. Berkshire (BRK.B) — 8 investors, avg 15% weight             │ │
│  │ 2. Alphabet (GOOGL) — 6 investors, avg 12% weight              │ │
│  │ 3. Meta (META) — 5 investors, avg 10% weight                   │ │
│  │ 4. Visa (V) — 4 investors, avg 8% weight                      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│  FEATURED INVESTOR SPOTLIGHT                                          │
│  [Photo] Mohnish Pabrai — Score: 8.70 — "Heads I win, tails..."     │
│  Latest move: Bought Micron (MU) — 28% of portfolio                  │
│  [View Full Profile →]                                                │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 Investors List Page (/investors)

**Purpose:** Browse and filter all tracked investors.

**Layout:**
```
┌──────────────────────────────────────────────────────────────────────┐
│  All Investors (38)                              [Search...]          │
│  [All] [FOLLOW (38)] [WATCH (56)]  Sort: [Score ▼] [Name] [Firm]    │
├──────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┐ ┌─────────────────────────┐            │
│  │ [Photo]                  │ │ [Photo]                  │            │
│  │ CHARLIE MUNGER    9.05   │ │ WARREN BUFFETT    8.90   │            │
│  │ Berkshire Hathaway       │ │ Berkshire Hathaway       │            │
│  │ ████████████████░ FOLLOW │ │ ████████████████░ FOLLOW │            │
│  │ Top: BRK, AAPL, BAC     │ │ Top: AAPL, BAC, AXP     │            │
│  └─────────────────────────┘ └─────────────────────────┘            │
│  ┌─────────────────────────┐ ┌─────────────────────────┐            │
│  │ NICK SLEEP        8.80   │ │ LI LU             8.75   │            │
│  │ Nomad (retired)          │ │ Himalaya Capital          │            │
│  │ ████████████████░ FOLLOW │ │ ████████████████░ FOLLOW │            │
│  └─────────────────────────┘ └─────────────────────────┘            │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.3 Investor Profile Page (/investors/[slug])

**Purpose:** Deep dive into a single investor.

**Sections:**
1. **Header** — Name, firm, photo, score badge, verdict, one-line philosophy quote
2. **Tabs**: Portfolio | Changes | Philosophy | History | Resources
3. **Portfolio Tab** (default):
   - Current holdings table: Stock, Shares, Value, % of Portfolio, Sector
   - Sector pie chart
   - Concentration metrics (top 5 = X%, top 10 = Y%)
4. **Changes Tab**:
   - Quarter-over-quarter position changes
   - NEW / INCREASED / DECREASED / SOLD badges
   - Delta shares and delta value
5. **Philosophy Tab**:
   - Full biography (2-3 paragraphs)
   - Investment philosophy description
   - 8-dimension radar chart with scores
   - Key quotes
   - Career timeline
6. **History Tab**:
   - Historical holdings over time (which stocks they've held and for how long)
   - Position sizing over time
7. **Resources Tab**:
   - Links to letters, interviews, books, talks
   - Key articles about this investor

### 5.4 Stock Page (/stocks/[ticker])

**Purpose:** See which investors own a given stock and why.

**Layout:**
```
┌──────────────────────────────────────────────────────────────────────┐
│  META — Meta Platforms Inc                                            │
│  Sector: Technology | Industry: Social Media                          │
│  Held by 5 FOLLOW investors                                          │
├──────────────────────────────────────────────────────────────────────┤
│  WHO OWNS THIS STOCK                                                  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Investor          │ Shares    │ Value    │ % Port │ Since     │  │
│  │ Cliff Sosin       │ 245,000   │ $156M    │ 42.3%  │ Q2 2021  │  │
│  │ John Huber        │ 180,000   │ $115M    │ 28.1%  │ Q3 2022  │  │
│  │ Mohnish Pabrai    │ 120,000   │ $76M     │ 15.2%  │ Q1 2023  │  │
│  │ Bill Ackman       │ 890,000   │ $568M    │ 12.4%  │ Q4 2023  │  │
│  │ Chris Hohn        │ 1.2M      │ $766M    │ 8.1%   │ Q2 2024  │  │
│  └────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│  AI-GENERATED CONSENSUS THESIS                                        │
│  "Meta is held by 5 top-ranked investors who collectively see it     │
│  as a dominant advertising platform with optionality in AI/metaverse.│
│  The common thread: pricing power from network effects..."           │
├──────────────────────────────────────────────────────────────────────┤
│  INDIVIDUAL THESES                                                    │
│  [Sosin] "Ultra-concentrated bet on Meta's AI monetization..."       │
│  [Huber] "Dominant digital advertising duopoly with..."              │
│  [Pabrai] "Asymmetric bet — downside protected by..."               │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.5 Changes Feed (/changes)

**Purpose:** Chronological feed of all position changes.

**Features:**
- Filterable by: investor, action type (new/increased/decreased/sold), date range
- Each entry: investor name, stock, action badge, share change, value change
- Sortable by: date, value, percentage change
- Grouped by filing quarter

### 5.6 Best Ideas Page (/best-ideas)

**Purpose:** Our curated ranking of top investment ideas.

**Scoring formula:**
- Overlap count × average investor quality score × average position weight
- Weighted toward investors with higher philosophy alignment scores

**Layout:** Ranked list with expandable cards showing:
- Stock name and ticker
- Number of FOLLOW investors holding it
- List of investors and their position sizes
- AI-generated synthesis of why multiple top investors converge on this stock
- Our assessment of the idea

### 5.7 Overlap / Cross-Reference Page (/overlap)

**Purpose:** Visual matrix of which investors own which stocks.

**Features:**
- Heat map: rows = investors, columns = stocks, cells = position weight
- Filter to top N stocks by overlap count
- Click any cell to see details
- Highlight clusters of agreement

### 5.8 About / Methodology (/about)

**Content:**
- How we select investors (8-dimension scoring explained)
- How we generate AI theses (methodology)
- Data sources (SEC EDGAR 13F, frequency, limitations)
- What 13F filings include and don't include
- Contact info

---

## 6. Data Model

### Core Entities (16 tables — see schema.sql for full details)

| Table | Purpose |
|-------|---------|
| investors | Super investor profiles, bio, philosophy, verdict |
| investor_scores | 8-dimension scoring per investor |
| securities | Stocks/securities (CUSIP, ticker, sector) |
| holdings | Current portfolio snapshot (latest quarter) |
| holdings_history | Full historical position record (every quarter) |
| position_changes | Quarter-over-quarter deltas |
| filings_13f | Raw 13F filing metadata |
| ai_theses | AI-generated investment theses per investor-stock |
| best_ideas | Curated quarterly rankings |
| investor_stock_overlap | Precomputed cross-investor analysis |
| content | Blog posts, articles |
| tags | Flexible tagging system |
| content_tags | Content-to-tag junction |
| security_tags | Security-to-tag junction |
| pipeline_runs | ETL pipeline state tracking |

---

## 7. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 14+ (App Router) | SSR for SEO, React for interactivity |
| Styling | Tailwind CSS | Utility-first, fast development |
| Database | Cloudflare D1 | Live runtime data for API endpoints on Cloudflare |
| Pipeline DB | Local SQLite | Intermediate build artifact before syncing refreshed data to D1 |
| ORM | None in runtime app | The current app reads D1 from the Worker and does not use a TypeScript ORM layer |
| Data Pipeline | Python | Existing EDGAR fetchers, XML parsing |
| AI Theses | Claude API | Best quality for financial analysis |
| Deployment | Cloudflare Pages + Worker + D1 | Static Pages frontend plus API Worker backed by D1 |
| Design | Light/white background | Clean, professional, user preference |

---

## 8. MVP Feature Prioritization

### MVP (v1) — Launch with this
- [ ] Home page with stats, latest changes, top ideas
- [ ] Investors list page with filtering/sorting
- [ ] Investor profile page (portfolio, philosophy, scores)
- [ ] Stock page (who owns it)
- [ ] Position changes feed
- [ ] Basic best ideas (overlap count)
- [ ] Static investor profiles from existing research data
- [ ] Responsive design
- [ ] SEO optimization (meta tags, structured data)

### v2 — Next iteration
- [ ] AI-generated theses per position (Claude API)
- [ ] Historical holdings tracking and charts
- [ ] Email alerts for new 13F filings
- [ ] Search functionality (investors + stocks)
- [ ] Investor comparison tool
- [ ] RSS feed

### v3 — Future
- [ ] User accounts and watchlists
- [ ] Custom investor screening
- [ ] API access for developers
- [ ] Mobile app (React Native)
- [ ] Real-time SEC filing monitoring (EDGAR RSS)
- [ ] Blog/content section
- [ ] Social sharing features

---

## 9. API Endpoints

### Investors
- `GET /api/investors` — List all investors (with scores, verdict)
- `GET /api/investors/[slug]` — Single investor profile
- `GET /api/investors/[slug]/holdings` — Current holdings
- `GET /api/investors/[slug]/changes` — Position changes
- `GET /api/investors/[slug]/history` — Historical holdings

### Stocks
- `GET /api/stocks` — All stocks held by tracked investors
- `GET /api/stocks/[ticker]` — Stock detail with investor list
- `GET /api/stocks/[ticker]/holders` — Which investors hold this stock
- `GET /api/stocks/[ticker]/theses` — AI theses for this stock

### Analysis
- `GET /api/best-ideas` — Curated best ideas ranking
- `GET /api/overlap` — Cross-investor overlap data
- `GET /api/changes` — Recent position changes (paginated)
- `GET /api/changes?investor=pabrai&action=new` — Filtered changes

### Data Pipeline
- `POST /api/pipeline/run` — Trigger 13F fetch (admin only)
- `GET /api/pipeline/status` — Pipeline run status

---

## 10. SEO Strategy

### Target Keywords
- "super investor portfolios"
- "what is buffett buying"
- "13F filings tracker"
- "value investor holdings"
- "best stock ideas from top investors"
- "[investor name] portfolio" (e.g., "mohnish pabrai portfolio")
- "who owns [ticker]" (e.g., "who owns meta stock")

### SEO Implementation
- Each investor profile = SEO-optimized landing page with structured data
- Each stock page = "who owns [TICKER]" landing page
- Meta tags, Open Graph, Twitter Cards on all pages
- JSON-LD structured data (Person, Organization, Dataset)
- Sitemap.xml auto-generated
- Blog/insights for content marketing (v3)

---

## 11. Design Principles

1. **Light/white background** — Clean, professional (user preference)
2. **Data-dense but not cluttered** — Tables for data, cards for browsing
3. **Green/red color coding** — Buy/sell, increase/decrease
4. **Score visualization** — Radar charts for 8-dimension scores
5. **Minimal animations** — Fast loading, no unnecessary motion
6. **Mobile-first responsive** — Works on all screen sizes
7. **Consistent typography** — System fonts for speed, clear hierarchy
8. **Accessible** — WCAG 2.1 AA compliance

---

## 12. User Flows

### Flow 1: "What are top investors buying?"
Home → Latest Changes feed → Click investor name → Investor profile → Portfolio tab

### Flow 2: "Should I look at this stock?"
Home → Best Ideas → Click stock → Stock page → See which investors own it → Read AI theses

### Flow 3: "Tell me about this investor"
Investors list → Filter by score → Click investor → Philosophy tab → Read bio and approach → Resources tab → Read their letters

### Flow 4: "Who else owns what I own?"
Stock page for my stock → See all investors who hold it → Compare their position sizes and theses

---

## 13. Launch Plan

1. **Scaffold Next.js app** with Tailwind, Drizzle, SQLite
2. **Seed database** with existing investor research data (145 investors, scores, profiles)
3. **Run 13F pipeline** to fetch current holdings for top 10 investors
4. **Build core pages** (home, investors list, investor profile, stock page, changes)
5. **Deploy to Vercel** under temporary URL
6. **Test and iterate** on design/UX
7. **Add remaining investors** and historical data
8. **Launch publicly** with SEO optimization
