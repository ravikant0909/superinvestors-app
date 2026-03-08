-- =============================================================================
-- SuperInvestors Database Schema
-- =============================================================================
-- Tracks ~40 super investors (value investors), their 13F holdings,
-- position changes, AI-generated theses, and curated best ideas.
--
-- Designed for SQLite initially, PostgreSQL-compatible with minor changes.
-- Timestamps stored as ISO 8601 text (SQLite) — swap to TIMESTAMP for Postgres.
-- =============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- =============================================================================
-- 1. INVESTORS — The super investors we track
-- =============================================================================
-- Each row is one fund manager / investor entity (e.g., Berkshire Hathaway,
-- Baupost Group). CIK is their SEC Central Index Key for 13F lookups.
-- =============================================================================

CREATE TABLE investors (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Identity
    name            TEXT NOT NULL,                       -- Display name, e.g. "Warren Buffett"
    slug            TEXT NOT NULL UNIQUE,                -- URL-safe identifier, e.g. "warren-buffett"
    firm_name       TEXT,                                -- e.g. "Berkshire Hathaway"
    cik             TEXT UNIQUE,                         -- SEC Central Index Key (for 13F lookup)

    -- Profile
    photo_url       TEXT,                                -- Headshot URL or local path
    biography       TEXT,                                -- Multi-paragraph bio (Markdown)
    philosophy      TEXT,                                -- Investment philosophy summary (Markdown)
    notable_quotes  TEXT,                                -- JSON array of notable quotes

    -- Classification
    style           TEXT,                                -- e.g. "Deep Value", "Quality Growth", "Special Situations"
    aum_range       TEXT,                                -- e.g. "$10B-$50B", "$1B-$5B" (approximate, from latest 13F)
    active          INTEGER NOT NULL DEFAULT 1,          -- 1 = actively tracked, 0 = inactive/retired

    -- External links (stored as JSON arrays of {label, url} objects)
    links_letters   TEXT,                                -- Links to annual letters
    links_interviews TEXT,                               -- Links to interviews, talks
    links_other     TEXT,                                -- Fund website, Wikipedia, etc.

    -- Our editorial verdict
    verdict_summary TEXT,                                -- One-paragraph verdict on this investor
    verdict_follow  TEXT CHECK (verdict_follow IN (
                        'strong_follow', 'follow', 'monitor', 'ignore'
                    )) DEFAULT 'monitor',                -- Should readers track this investor?

    -- Metadata
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_investors_slug ON investors(slug);
CREATE INDEX idx_investors_cik ON investors(cik);
CREATE INDEX idx_investors_active ON investors(active);


-- =============================================================================
-- 2. INVESTOR SCORES — 8-dimension scoring for each investor
-- =============================================================================
-- Separated from investors table because scores are editorial content that
-- may be revised independently and we want full audit history.
-- Each dimension is scored 1-10. One row per investor (latest scores).
-- =============================================================================

CREATE TABLE investor_scores (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_id     INTEGER NOT NULL UNIQUE REFERENCES investors(id) ON DELETE CASCADE,

    -- 8 scoring dimensions (1-10 scale, 10 = best)
    philosophy_score      INTEGER CHECK (philosophy_score BETWEEN 1 AND 10),       -- Clarity & coherence of investment philosophy
    concentration_score   INTEGER CHECK (concentration_score BETWEEN 1 AND 10),    -- Conviction sizing (high = concentrated, which we like)
    rationality_score     INTEGER CHECK (rationality_score BETWEEN 1 AND 10),      -- Evidence of rational decision-making
    integrity_score       INTEGER CHECK (integrity_score BETWEEN 1 AND 10),        -- Alignment with LPs, honest communication
    track_record_score    INTEGER CHECK (track_record_score BETWEEN 1 AND 10),     -- Long-term performance vs benchmarks
    transparency_score    INTEGER CHECK (transparency_score BETWEEN 1 AND 10),     -- Quality of letters, public commentary
    relevance_score       INTEGER CHECK (relevance_score BETWEEN 1 AND 10),        -- Still actively managing money, not coasting
    agi_awareness_score   INTEGER CHECK (agi_awareness_score BETWEEN 1 AND 10),    -- Understanding of AI/AGI disruption risks

    -- Commentary on scores
    score_notes     TEXT,                                -- Markdown notes explaining the scores

    -- Composite (computed, but stored for query convenience)
    composite_score REAL,                                -- Weighted average of all 8 dimensions

    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);


-- =============================================================================
-- 3. SECURITIES — Every stock/security held by any tracked investor
-- =============================================================================
-- CUSIP is the canonical identifier in 13F filings. Ticker may be null for
-- delisted or obscure securities. sector/industry follow GICS classification.
-- =============================================================================

CREATE TABLE securities (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Identifiers
    cusip           TEXT UNIQUE,                         -- 9-char CUSIP from 13F (canonical ID)
    ticker          TEXT,                                -- NYSE/NASDAQ ticker (may be null for OTC, delisted)
    name            TEXT NOT NULL,                       -- Company name as reported in 13F
    slug            TEXT UNIQUE,                         -- URL-safe, e.g. "apple-inc"

    -- Classification
    sector          TEXT,                                -- GICS sector, e.g. "Information Technology"
    industry        TEXT,                                -- GICS industry, e.g. "Semiconductors"
    security_type   TEXT DEFAULT 'common_stock' CHECK (security_type IN (
                        'common_stock', 'preferred_stock', 'convertible',
                        'etf', 'adr', 'warrant', 'option', 'other'
                    )),

    -- Company details
    description     TEXT,                                -- One-paragraph company description
    market_cap_range TEXT,                               -- e.g. "Mega ($200B+)", "Large ($10B-$200B)", etc.
    exchange        TEXT,                                -- NYSE, NASDAQ, OTC, etc.
    country         TEXT DEFAULT 'US',                   -- Country of domicile

    -- Status
    active          INTEGER NOT NULL DEFAULT 1,          -- 1 = currently tradeable, 0 = delisted/merged

    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_securities_cusip ON securities(cusip);
CREATE INDEX idx_securities_ticker ON securities(ticker);
CREATE INDEX idx_securities_slug ON securities(slug);
CREATE INDEX idx_securities_sector ON securities(sector);


-- =============================================================================
-- 4. FILINGS_13F — Raw 13F filing metadata
-- =============================================================================
-- One row per quarterly 13F filing per investor. This is the source of truth
-- for when data was reported vs when it was filed with the SEC.
-- =============================================================================

CREATE TABLE filings_13f (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_id     INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,

    -- SEC filing metadata
    accession_number TEXT NOT NULL UNIQUE,               -- SEC accession number (unique filing ID)
    filing_date     TEXT NOT NULL,                       -- Date filed with SEC (YYYY-MM-DD)
    report_date     TEXT NOT NULL,                       -- End of quarter reported (YYYY-MM-DD), e.g. 2025-12-31
    quarter         INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),  -- Calendar quarter (1-4)
    year            INTEGER NOT NULL,                    -- Calendar year

    -- Aggregate data from filing
    total_value     REAL,                                -- Total portfolio value in $thousands (as reported in 13F)
    position_count  INTEGER,                             -- Number of distinct positions in filing
    filing_url      TEXT,                                -- Direct URL to SEC filing

    -- Processing status
    processed       INTEGER NOT NULL DEFAULT 0,          -- 1 = holdings extracted, 0 = not yet
    raw_xml         TEXT,                                -- Raw 13F XML (optional, for reprocessing)

    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_filings_investor ON filings_13f(investor_id);
CREATE INDEX idx_filings_quarter ON filings_13f(year, quarter);
CREATE INDEX idx_filings_report_date ON filings_13f(report_date);
CREATE UNIQUE INDEX idx_filings_investor_quarter ON filings_13f(investor_id, year, quarter);


-- =============================================================================
-- 5. HOLDINGS — Current portfolio snapshot for each investor
-- =============================================================================
-- Contains the LATEST positions only. Overwritten each quarter when new 13F
-- is processed. For historical data, see holdings_history.
-- This table enables fast "show me Buffett's current portfolio" queries.
-- =============================================================================

CREATE TABLE holdings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_id     INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    security_id     INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
    filing_id       INTEGER REFERENCES filings_13f(id) ON DELETE SET NULL,

    -- Position data (from 13F)
    shares          INTEGER NOT NULL,                    -- Number of shares held
    value           REAL NOT NULL,                       -- Market value in $thousands (as reported)
    pct_of_portfolio REAL,                               -- This position as % of total portfolio (0-100)

    -- Classification (from 13F)
    put_call        TEXT CHECK (put_call IN ('PUT', 'CALL', NULL)),  -- Options only
    investment_discretion TEXT DEFAULT 'SOLE',            -- SOLE, SHARED, or OTHER

    -- Derived / editorial
    position_rank   INTEGER,                             -- Rank by % of portfolio (1 = largest)

    -- Dates
    report_date     TEXT NOT NULL,                       -- Quarter end date this snapshot represents
    filing_date     TEXT,                                -- When the 13F was filed

    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    UNIQUE(investor_id, security_id)                     -- One row per investor-security in current holdings
);

CREATE INDEX idx_holdings_investor ON holdings(investor_id);
CREATE INDEX idx_holdings_security ON holdings(security_id);
CREATE INDEX idx_holdings_pct ON holdings(pct_of_portfolio DESC);


-- =============================================================================
-- 6. HOLDINGS HISTORY — Full historical record of every position ever held
-- =============================================================================
-- One row per investor-security-quarter. Never deleted, only appended.
-- This is the core data for tracking position evolution over time.
-- =============================================================================

CREATE TABLE holdings_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_id     INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    security_id     INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
    filing_id       INTEGER REFERENCES filings_13f(id) ON DELETE SET NULL,

    -- Time dimension
    year            INTEGER NOT NULL,
    quarter         INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    report_date     TEXT NOT NULL,                       -- Quarter end date (YYYY-MM-DD)
    filing_date     TEXT,                                -- When the 13F was filed

    -- Position data
    shares          INTEGER NOT NULL,
    value           REAL NOT NULL,                       -- Market value in $thousands
    pct_of_portfolio REAL,                               -- % of total portfolio (0-100)

    -- Classification
    put_call        TEXT CHECK (put_call IN ('PUT', 'CALL', NULL)),
    investment_discretion TEXT DEFAULT 'SOLE',

    -- Derived
    position_rank   INTEGER,

    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    UNIQUE(investor_id, security_id, year, quarter)
);

CREATE INDEX idx_hh_investor ON holdings_history(investor_id);
CREATE INDEX idx_hh_security ON holdings_history(security_id);
CREATE INDEX idx_hh_quarter ON holdings_history(year, quarter);
CREATE INDEX idx_hh_investor_quarter ON holdings_history(investor_id, year, quarter);
CREATE INDEX idx_hh_security_quarter ON holdings_history(security_id, year, quarter);
-- For "when did investor X first buy security Y" and position timeline queries
CREATE INDEX idx_hh_investor_security ON holdings_history(investor_id, security_id, year, quarter);


-- =============================================================================
-- 7. POSITION CHANGES — Quarter-over-quarter changes (derived from history)
-- =============================================================================
-- Computed when a new 13F is processed by comparing to previous quarter.
-- Categorizes each change as new/increased/decreased/sold_out/unchanged.
-- Powers the "What changed?" view on investor pages.
-- =============================================================================

CREATE TABLE position_changes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_id     INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    security_id     INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
    filing_id       INTEGER REFERENCES filings_13f(id) ON DELETE SET NULL,

    -- Time dimension
    year            INTEGER NOT NULL,
    quarter         INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    report_date     TEXT NOT NULL,

    -- Change classification
    change_type     TEXT NOT NULL CHECK (change_type IN (
                        'new',          -- Position opened this quarter
                        'increased',    -- Added shares
                        'decreased',    -- Reduced shares
                        'sold_out',     -- Position fully exited
                        'unchanged'     -- Same share count (rarely stored, but useful for completeness)
                    )),

    -- Quantitative change
    shares_before   INTEGER DEFAULT 0,                   -- Shares held previous quarter (0 if new)
    shares_after    INTEGER DEFAULT 0,                   -- Shares held this quarter (0 if sold_out)
    shares_change   INTEGER NOT NULL,                    -- shares_after - shares_before
    shares_change_pct REAL,                              -- % change in shares (null if new position)

    value_before    REAL DEFAULT 0,                      -- Value previous quarter ($thousands)
    value_after     REAL DEFAULT 0,                      -- Value this quarter ($thousands)
    value_change    REAL,                                -- value_after - value_before

    pct_of_portfolio_before REAL DEFAULT 0,
    pct_of_portfolio_after  REAL DEFAULT 0,

    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    UNIQUE(investor_id, security_id, year, quarter)
);

CREATE INDEX idx_pc_investor ON position_changes(investor_id);
CREATE INDEX idx_pc_security ON position_changes(security_id);
CREATE INDEX idx_pc_quarter ON position_changes(year, quarter);
CREATE INDEX idx_pc_change_type ON position_changes(change_type);
-- For "show me all new buys this quarter across all investors"
CREATE INDEX idx_pc_type_quarter ON position_changes(change_type, year, quarter);


-- =============================================================================
-- 8. AI THESES — AI-generated investment theses per investor-stock pair
-- =============================================================================
-- When an investor holds or buys a stock, we generate an AI thesis explaining
-- WHY they likely hold it, how it fits their style, and our risk assessment.
-- Multiple theses can exist per pair (e.g., updated when position changes).
-- =============================================================================

CREATE TABLE ai_theses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_id     INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    security_id     INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,

    -- Thesis content (Markdown)
    thesis_type     TEXT NOT NULL CHECK (thesis_type IN (
                        'initial_buy',      -- Generated when position first appears
                        'position_increase', -- Generated when position is added to
                        'position_decrease', -- Generated when position is trimmed
                        'exit',             -- Generated when position is fully sold
                        'quarterly_update', -- Periodic refresh of thesis
                        'deep_dive'         -- Manual deep analysis
                    )),
    title           TEXT NOT NULL,                       -- Short title, e.g. "Why Buffett Likely Bought XYZ"
    summary         TEXT,                                -- 2-3 sentence TL;DR
    thesis_body     TEXT NOT NULL,                       -- Full thesis (Markdown, typically 500-2000 words)

    -- Style fit analysis
    style_fit_score INTEGER CHECK (style_fit_score BETWEEN 1 AND 10),  -- How well does this fit their known style?
    style_fit_notes TEXT,                                -- Explanation of style fit

    -- Risk assessment
    risk_level      TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'very_high')),
    risk_notes      TEXT,

    -- Generation metadata
    model_used      TEXT,                                -- e.g. "claude-opus-4-6", "gpt-4o"
    prompt_version  TEXT,                                -- Version of prompt template used
    generation_date TEXT NOT NULL,                       -- When this thesis was generated

    -- Context: which quarter triggered this thesis
    trigger_year    INTEGER,
    trigger_quarter INTEGER,

    -- Editorial
    published       INTEGER NOT NULL DEFAULT 0,          -- 1 = visible on site, 0 = draft
    editor_notes    TEXT,                                -- Human editor annotations

    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_theses_investor ON ai_theses(investor_id);
CREATE INDEX idx_theses_security ON ai_theses(security_id);
CREATE INDEX idx_theses_pair ON ai_theses(investor_id, security_id);
CREATE INDEX idx_theses_published ON ai_theses(published);
CREATE INDEX idx_theses_type ON ai_theses(thesis_type);


-- =============================================================================
-- 9. BEST IDEAS — Curated rankings of top stock ideas
-- =============================================================================
-- Our editorial "best ideas" list, updated quarterly. Combines investor
-- overlap (how many super investors own it), conviction sizing, and our
-- own analysis. Each row is one stock in a specific ranking period.
-- =============================================================================

CREATE TABLE best_ideas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    security_id     INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,

    -- Ranking period
    year            INTEGER NOT NULL,
    quarter         INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),

    -- Ranking data
    rank            INTEGER NOT NULL,                    -- 1 = top idea
    score           REAL,                                -- Composite score used for ranking (0-100)

    -- Cross-investor analysis
    investor_count  INTEGER NOT NULL DEFAULT 0,          -- How many tracked investors hold this stock
    investor_ids    TEXT,                                 -- JSON array of investor IDs who hold it
    total_value_held REAL,                               -- Combined value held by all tracked investors ($thousands)
    avg_pct_of_portfolio REAL,                           -- Average portfolio weight across holders

    -- Our analysis
    reasoning       TEXT,                                -- Why this is a best idea (Markdown)
    category        TEXT CHECK (category IN (
                        'high_conviction',   -- Many top investors, large positions
                        'contrarian',        -- Few investors but very high conviction
                        'new_consensus',     -- Multiple investors recently initiated
                        'compounder',        -- Long-held by multiple investors
                        'special_situation'  -- Catalyst-driven
                    )),

    -- Status
    published       INTEGER NOT NULL DEFAULT 0,

    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    UNIQUE(security_id, year, quarter)
);

CREATE INDEX idx_bi_quarter ON best_ideas(year, quarter);
CREATE INDEX idx_bi_rank ON best_ideas(year, quarter, rank);
CREATE INDEX idx_bi_security ON best_ideas(security_id);


-- =============================================================================
-- 10. INVESTOR STOCK OVERLAP — Cross-investor analysis (materialized view)
-- =============================================================================
-- Precomputed table showing which investors share positions. Updated each
-- quarter. Enables "Who else owns AAPL?" and "What do Buffett and Pabrai
-- have in common?" queries without expensive joins.
-- =============================================================================

CREATE TABLE investor_stock_overlap (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    security_id     INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,

    -- Snapshot period
    year            INTEGER NOT NULL,
    quarter         INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),

    -- Overlap data
    holder_count    INTEGER NOT NULL DEFAULT 0,          -- Number of tracked investors holding this stock
    holder_investor_ids TEXT,                             -- JSON array of investor IDs
    holder_names    TEXT,                                 -- JSON array of investor names (denormalized for display)
    total_shares    INTEGER,                             -- Combined shares across all holders
    total_value     REAL,                                -- Combined value across all holders ($thousands)
    avg_portfolio_weight REAL,                           -- Average % of portfolio across holders
    max_portfolio_weight REAL,                           -- Highest conviction holder's weight
    max_weight_investor_id INTEGER REFERENCES investors(id),  -- Who has the highest conviction

    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    UNIQUE(security_id, year, quarter)
);

CREATE INDEX idx_iso_quarter ON investor_stock_overlap(year, quarter);
CREATE INDEX idx_iso_holder_count ON investor_stock_overlap(holder_count DESC);
CREATE INDEX idx_iso_security ON investor_stock_overlap(security_id);


-- =============================================================================
-- 11. CONTENT — Blog posts, analysis articles, commentary
-- =============================================================================

CREATE TABLE content (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Content metadata
    title           TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,                 -- URL-safe identifier
    content_type    TEXT NOT NULL CHECK (content_type IN (
                        'article',          -- Long-form analysis
                        'quarterly_recap',  -- Quarterly 13F roundup
                        'investor_profile', -- Deep dive on an investor
                        'stock_spotlight',  -- Deep dive on a stock across investors
                        'methodology',      -- Explanation of our approach
                        'announcement'      -- Site announcements
                    )),

    -- Content body
    summary         TEXT,                                -- Short excerpt for cards/previews
    body            TEXT NOT NULL,                       -- Full content (Markdown)
    cover_image_url TEXT,                                -- Hero image

    -- Relationships (optional — not all content is about a specific investor/stock)
    investor_id     INTEGER REFERENCES investors(id) ON DELETE SET NULL,
    security_id     INTEGER REFERENCES securities(id) ON DELETE SET NULL,

    -- Publishing
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    published_at    TEXT,                                 -- When it went live
    author          TEXT DEFAULT 'SuperInvestors',

    -- SEO
    meta_title      TEXT,
    meta_description TEXT,

    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_content_slug ON content(slug);
CREATE INDEX idx_content_type ON content(content_type);
CREATE INDEX idx_content_status ON content(status);
CREATE INDEX idx_content_published ON content(published_at DESC);
CREATE INDEX idx_content_investor ON content(investor_id);
CREATE INDEX idx_content_security ON content(security_id);


-- =============================================================================
-- 12. TAGS — Flexible tagging for content and securities
-- =============================================================================

CREATE TABLE tags (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,                 -- e.g. "value-investing", "tech", "Q4-2025"
    slug            TEXT NOT NULL UNIQUE,
    tag_type        TEXT DEFAULT 'general' CHECK (tag_type IN (
                        'general', 'sector', 'theme', 'quarter', 'strategy'
                    )),

    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE content_tags (
    content_id      INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    tag_id          INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (content_id, tag_id)
);

CREATE TABLE security_tags (
    security_id     INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
    tag_id          INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (security_id, tag_id)
);


-- =============================================================================
-- 13. DATA PIPELINE STATE — Track ETL processing status
-- =============================================================================
-- Tracks the state of our data pipeline so we know what's been processed,
-- what failed, and what needs reprocessing. Essential for incremental updates.
-- =============================================================================

CREATE TABLE pipeline_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_type        TEXT NOT NULL CHECK (run_type IN (
                        'fetch_13f',         -- Download 13F filings from EDGAR
                        'parse_13f',         -- Parse XML into holdings
                        'compute_changes',   -- Calculate position changes
                        'compute_overlap',   -- Update cross-investor overlap
                        'generate_theses',   -- AI thesis generation
                        'compute_best_ideas', -- Rank best ideas
                        'full_refresh'       -- Complete pipeline run
                    )),
    investor_id     INTEGER REFERENCES investors(id) ON DELETE SET NULL,  -- null if run covers all investors

    -- Run details
    year            INTEGER,
    quarter         INTEGER,
    status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
                        'running', 'completed', 'failed', 'partial'
                    )),
    records_processed INTEGER DEFAULT 0,
    error_message   TEXT,

    started_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    completed_at    TEXT,

    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_pipeline_type ON pipeline_runs(run_type);
CREATE INDEX idx_pipeline_status ON pipeline_runs(status);


-- =============================================================================
-- SEED DATA
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Investors
-- ---------------------------------------------------------------------------

INSERT INTO investors (name, slug, firm_name, cik, philosophy, style, aum_range, biography, notable_quotes, verdict_summary, verdict_follow) VALUES
(
    'Warren Buffett',
    'warren-buffett',
    'Berkshire Hathaway',
    '0001067983',
    'Buy wonderful companies at fair prices. Focus on durable competitive advantages (moats), honest and able management, and businesses within your circle of competence. Hold forever if the business remains excellent. Margin of safety is paramount. "It''s far better to buy a wonderful company at a fair price than a fair company at a wonderful price."',
    'Quality Compounding',
    '$200B+',
    'Warren Edward Buffett (born August 30, 1930) is an American businessman, investor, and philanthropist who serves as chairman and CEO of Berkshire Hathaway. Widely regarded as the most successful investor of the 20th century, Buffett is known as the "Oracle of Omaha." A student of Benjamin Graham, he evolved from pure net-net value investing to quality compounding under the influence of Charlie Munger. His annual letters to shareholders are required reading for any serious investor.',
    '["Rule No. 1: Never lose money. Rule No. 2: Never forget Rule No. 1.", "Be fearful when others are greedy and greedy when others are fearful.", "Our favorite holding period is forever.", "Price is what you pay. Value is what you get.", "It''s far better to buy a wonderful company at a fair price than a fair company at a wonderful price."]',
    'The greatest investor alive. His 13F is less useful than it used to be because Berkshire''s portfolio is enormous and constrained by size — he can only buy mega-caps. But his new position initiations still carry enormous signal. His annual letters remain the single best source of investing wisdom.',
    'strong_follow'
),
(
    'Seth Klarman',
    'seth-klarman',
    'Baupost Group',
    '0001061768',
    'Deep value with a margin of safety. Willing to hold large cash positions (often 30-50% of portfolio) when opportunities are scarce. Invests across the capital structure — equities, distressed debt, real estate, private investments. "The single greatest edge an investor can have is a long-term orientation." Avoids permanent capital loss above all else.',
    'Deep Value / Multi-Asset',
    '$20B-$30B',
    'Seth Andrew Klarman (born May 21, 1957) is an American billionaire investor and author. He is the CEO and portfolio manager of the Baupost Group, a Boston-based private investment partnership. His book "Margin of Safety: Risk-Averse Value Investing Strategies for the Thoughtful Investor" (1991) is out of print and sells for over $1,000 used. Klarman is known for his extreme patience, willingness to hold cash, and contrarian approach. He rarely speaks publicly, making his 13F filings one of the few windows into his thinking.',
    '["The stock market is the story of cycles and of the human behavior that is responsible for overreactions in both directions.", "Investors should always keep in mind that the most important metric is not the returns achieved but the returns weighed against the risks incurred.", "Value investing is at its core the marriage of a contrarian streak and a calculator."]',
    'One of the most disciplined value investors alive. His willingness to hold 30-50% cash is rare and shows real conviction. Baupost''s returns (estimated 15-20% annualized over 30+ years) with lower volatility than the market make him the closest thing to Buffett in the current generation. His 13F is highly informative because his positions tend to be concentrated and contrarian.',
    'strong_follow'
),
(
    'Mohnish Pabrai',
    'mohnish-pabrai',
    'Pabrai Investment Funds',
    '0001173334',
    'Extreme concentration in "heads I win, tails I don''t lose much" situations. Few bets, big bets, infrequent bets. Clones ideas from other great investors (notably Buffett). Focuses on low downside with asymmetric upside. "Investing is simple but not easy." Favors owner-operators and companies with durable competitive advantages.',
    'Concentrated Value / Cloning',
    '$500M-$1B',
    'Mohnish Pabrai (born June 12, 1964) is an Indian-American businessman, investor, and philanthropist. He is the managing partner of Pabrai Investment Funds. Born in Mumbai, he founded TransTech, Inc. in 1991 with $100K from his 401(k), grew it, and sold it before launching his fund in 1999 modeled after Buffett''s original partnerships. He is known for his "Dhandho" framework (heads I win, tails I don''t lose much), extreme portfolio concentration (often 5-10 positions), and his shameless cloning strategy. His book "The Dhandho Investor" is a classic.',
    '["Heads I win, tails I don''t lose much.", "Few bets, big bets, infrequent bets.", "Cloning is a very legitimate investment strategy.", "The stock market is a no-called-strike game. You can wait for your pitch."]',
    'Pabrai''s extreme concentration means his 13F is very high-signal — every position represents a major conviction bet. His willingness to clone from Buffett and others, combined with his own analytical framework, often surfaces interesting ideas. However, his smaller AUM means he can invest in smaller companies that may not be accessible to all investors. His track record has been volatile but strong over long periods.',
    'follow'
);

-- ---------------------------------------------------------------------------
-- Investor Scores
-- ---------------------------------------------------------------------------

INSERT INTO investor_scores (investor_id, philosophy_score, concentration_score, rationality_score, integrity_score, track_record_score, transparency_score, relevance_score, agi_awareness_score, score_notes, composite_score) VALUES
(
    1,  -- Buffett
    10, 7, 10, 10, 10, 10, 7, 4,
    'Philosophy: Unmatched clarity, consistency over 60+ years. Concentration: Was more concentrated historically; Berkshire''s size now forces diversification. Rationality: Gold standard. Integrity: Perfect alignment with shareholders. Track record: 20%+ CAGR over 58 years. Transparency: Annual letters are legendary. Relevance: Age and portfolio size are concerns; still making moves (AAPL trim, OXY build). AGI awareness: Has acknowledged AI but shows limited deep engagement; traditional industries focus.',
    8.5
),
(
    2,  -- Klarman
    10, 8, 10, 10, 9, 5, 9, 5,
    'Philosophy: "Margin of Safety" literally wrote the book. Concentration: Holds large cash (30-50%) but concentrated in equity positions. Rationality: Among the most disciplined. Integrity: Known for returning capital when opportunities are scarce. Track record: ~15-20% CAGR with lower volatility. Transparency: Very private, rarely speaks publicly — low transparency by choice. Relevance: Still very actively managing. AGI awareness: Limited public commentary on AI/AGI; traditional value approach.',
    8.25
),
(
    3,  -- Pabrai
    9, 10, 8, 9, 8, 9, 9, 6,
    'Philosophy: Dhandho framework is excellent and clearly articulated. Concentration: Maximum conviction — often 5-10 positions. Rationality: Generally excellent but occasional behavioral errors (e.g., some airline bets). Integrity: Strong alignment, honest about mistakes. Track record: Volatile but strong long-term. Transparency: Very open — speeches, interviews, books. Relevance: Actively investing, comfortable with tech. AGI awareness: Has discussed AI in recent talks; more engaged than most value investors.',
    8.5
);

-- ---------------------------------------------------------------------------
-- Sample Securities
-- ---------------------------------------------------------------------------

INSERT INTO securities (cusip, ticker, name, slug, sector, industry, security_type, market_cap_range, exchange, description) VALUES
('037833100', 'AAPL', 'Apple Inc', 'apple-inc', 'Information Technology', 'Technology Hardware', 'common_stock', 'Mega ($200B+)', 'NASDAQ',
 'Consumer electronics, software, and services company. Makes iPhone, iPad, Mac, Apple Watch, and operates services including App Store, Apple Music, iCloud, and Apple TV+.'),
('30303M102', 'META', 'Meta Platforms Inc', 'meta-platforms', 'Communication Services', 'Interactive Media', 'common_stock', 'Mega ($200B+)', 'NASDAQ',
 'Social media and technology conglomerate operating Facebook, Instagram, WhatsApp, and Messenger. Investing heavily in AI and metaverse (Reality Labs).'),
('023135106', 'AMZN', 'Amazon.com Inc', 'amazon', 'Consumer Discretionary', 'Broadline Retail', 'common_stock', 'Mega ($200B+)', 'NASDAQ',
 'E-commerce, cloud computing (AWS), digital streaming, and artificial intelligence company. AWS is the world''s leading cloud infrastructure provider.'),
('68389X105', 'OXY', 'Occidental Petroleum Corp', 'occidental-petroleum', 'Energy', 'Oil Gas & Consumable Fuels', 'common_stock', 'Large ($10B-$200B)', 'NYSE',
 'Oil and gas exploration and production company. Also operates chemical manufacturing (OxyChem) and midstream/marketing businesses. Buffett''s largest recent accumulation.'),
('09075V102', 'BKNG', 'Booking Holdings Inc', 'booking-holdings', 'Consumer Discretionary', 'Hotels Restaurants & Leisure', 'common_stock', 'Mega ($200B+)', 'NASDAQ',
 'Online travel company operating Booking.com, Priceline, Kayak, and OpenTable. Capital-light business model with strong network effects.');

-- ---------------------------------------------------------------------------
-- Sample 13F Filing
-- ---------------------------------------------------------------------------

INSERT INTO filings_13f (investor_id, accession_number, filing_date, report_date, quarter, year, total_value, position_count, processed) VALUES
(1, '0000950123-25-003456', '2025-02-14', '2024-12-31', 4, 2024, 267000000, 41, 1),
(2, '0000950123-25-004567', '2025-02-14', '2024-12-31', 4, 2024, 6200000, 28, 1),
(3, '0000950123-25-005678', '2025-02-14', '2024-12-31', 4, 2024, 890000, 7, 1);

-- ---------------------------------------------------------------------------
-- Sample Holdings (Buffett Q4 2024 — simplified)
-- ---------------------------------------------------------------------------

INSERT INTO holdings (investor_id, security_id, filing_id, shares, value, pct_of_portfolio, report_date, filing_date, position_rank) VALUES
(1, 1, 1, 300000000, 75000000, 28.1, '2024-12-31', '2025-02-14', 1),   -- AAPL
(1, 4, 1, 264000000, 14000000, 5.2, '2024-12-31', '2025-02-14', 5),    -- OXY
(3, 5, 3, 50000, 250000, 28.1, '2024-12-31', '2025-02-14', 1);          -- BKNG (Pabrai)

-- ---------------------------------------------------------------------------
-- Sample Holdings History
-- ---------------------------------------------------------------------------

INSERT INTO holdings_history (investor_id, security_id, filing_id, year, quarter, report_date, filing_date, shares, value, pct_of_portfolio, position_rank) VALUES
(1, 1, 1, 2024, 4, '2024-12-31', '2025-02-14', 300000000, 75000000, 28.1, 1),
(1, 4, 1, 2024, 4, '2024-12-31', '2025-02-14', 264000000, 14000000, 5.2, 5),
(3, 5, 3, 2024, 4, '2024-12-31', '2025-02-14', 50000, 250000, 28.1, 1);

-- ---------------------------------------------------------------------------
-- Sample Position Change
-- ---------------------------------------------------------------------------

INSERT INTO position_changes (investor_id, security_id, filing_id, year, quarter, report_date, change_type, shares_before, shares_after, shares_change, shares_change_pct, value_before, value_after, value_change) VALUES
(1, 1, 1, 2024, 4, '2024-12-31', 'decreased', 400000000, 300000000, -100000000, -25.0, 91000000, 75000000, -16000000);

-- ---------------------------------------------------------------------------
-- Sample Tags
-- ---------------------------------------------------------------------------

INSERT INTO tags (name, slug, tag_type) VALUES
('Value Investing', 'value-investing', 'strategy'),
('Technology', 'technology', 'sector'),
('Energy', 'energy', 'sector'),
('Q4 2024', 'q4-2024', 'quarter'),
('AI / Artificial Intelligence', 'ai-artificial-intelligence', 'theme'),
('Compounder', 'compounder', 'theme'),
('Capital Allocator', 'capital-allocator', 'strategy');
