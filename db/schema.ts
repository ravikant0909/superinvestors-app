// =============================================================================
// SuperInvestors — Drizzle ORM Schema
// =============================================================================
// Tracks ~40 super investors, their 13F holdings, position changes,
// AI-generated theses, and curated best ideas.
//
// Using drizzle-orm/sqlite-core. To migrate to PostgreSQL, swap imports to
// drizzle-orm/pg-core and change text timestamps to timestamp().
// =============================================================================

import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Helper for default timestamps
const now = sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`;

// =============================================================================
// 1. INVESTORS — The super investors we track
// =============================================================================
// Each row is one fund manager / investor entity (e.g., Berkshire Hathaway,
// Baupost Group). CIK is their SEC Central Index Key for 13F lookups.
// =============================================================================

export const investors = sqliteTable(
  "investors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    // Identity
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(), // URL-safe identifier, e.g. "warren-buffett"
    firmName: text("firm_name"),
    cik: text("cik").unique(), // SEC Central Index Key (for 13F filing lookup)

    // Profile
    photoUrl: text("photo_url"),
    biography: text("biography"), // Multi-paragraph bio (Markdown)
    philosophy: text("philosophy"), // Investment philosophy summary (Markdown)
    notableQuotes: text("notable_quotes"), // JSON array of notable quotes

    // Classification
    style: text("style"), // e.g. "Deep Value", "Quality Growth", "Special Situations"
    aumRange: text("aum_range"), // e.g. "$10B-$50B" (approximate, from latest 13F)
    active: integer("active").notNull().default(1), // 1 = actively tracked, 0 = inactive/retired

    // External links (stored as JSON arrays of {label, url} objects)
    linksLetters: text("links_letters"),
    linksInterviews: text("links_interviews"),
    linksOther: text("links_other"),

    // Our editorial verdict
    verdictSummary: text("verdict_summary"),
    verdictFollow: text("verdict_follow").default("monitor"), // 'strong_follow' | 'follow' | 'monitor' | 'ignore'

    // Metadata
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("idx_investors_slug").on(table.slug),
    index("idx_investors_cik").on(table.cik),
    index("idx_investors_active").on(table.active),
  ]
);

// TypeScript type helpers
export type Investor = typeof investors.$inferSelect;
export type NewInvestor = typeof investors.$inferInsert;

// =============================================================================
// 2. INVESTOR SCORES — 8-dimension scoring for each investor
// =============================================================================
// Separated from investors table because scores are editorial content that
// may be revised independently. Each dimension is scored 1-10.
// =============================================================================

export const investorScores = sqliteTable("investor_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  investorId: integer("investor_id")
    .notNull()
    .unique()
    .references(() => investors.id, { onDelete: "cascade" }),

  // 8 scoring dimensions (1-10 scale, 10 = best)
  philosophyScore: integer("philosophy_score"), // Clarity & coherence of investment philosophy
  concentrationScore: integer("concentration_score"), // Conviction sizing (high = concentrated)
  rationalityScore: integer("rationality_score"), // Evidence of rational decision-making
  integrityScore: integer("integrity_score"), // Alignment with LPs, honest communication
  trackRecordScore: integer("track_record_score"), // Long-term performance vs benchmarks
  transparencyScore: integer("transparency_score"), // Quality of letters, public commentary
  relevanceScore: integer("relevance_score"), // Still actively managing money
  agiAwarenessScore: integer("agi_awareness_score"), // Understanding of AI/AGI disruption risks

  // Commentary on scores
  scoreNotes: text("score_notes"), // Markdown notes explaining the scores

  // Composite (computed, stored for query convenience)
  compositeScore: real("composite_score"), // Weighted average of all 8 dimensions

  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

export type InvestorScore = typeof investorScores.$inferSelect;
export type NewInvestorScore = typeof investorScores.$inferInsert;

// =============================================================================
// 3. SECURITIES — Every stock/security held by any tracked investor
// =============================================================================
// CUSIP is the canonical identifier in 13F filings. Ticker may be null for
// delisted or obscure securities. sector/industry follow GICS classification.
// =============================================================================

export const securities = sqliteTable(
  "securities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    // Identifiers
    cusip: text("cusip").unique(), // 9-char CUSIP from 13F (canonical ID)
    ticker: text("ticker"), // NYSE/NASDAQ ticker (may be null for OTC, delisted)
    name: text("name").notNull(), // Company name as reported in 13F
    slug: text("slug").unique(), // URL-safe, e.g. "apple-inc"

    // Classification
    sector: text("sector"), // GICS sector, e.g. "Information Technology"
    industry: text("industry"), // GICS industry, e.g. "Semiconductors"
    securityType: text("security_type").default("common_stock"),
    // Valid values: 'common_stock' | 'preferred_stock' | 'convertible' | 'etf' | 'adr' | 'warrant' | 'option' | 'other'

    // Company details
    description: text("description"), // One-paragraph company description
    marketCapRange: text("market_cap_range"), // e.g. "Mega ($200B+)", "Large ($10B-$200B)"
    exchange: text("exchange"), // NYSE, NASDAQ, OTC, etc.
    country: text("country").default("US"),

    // Status
    active: integer("active").notNull().default(1), // 1 = currently tradeable, 0 = delisted/merged

    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("idx_securities_cusip").on(table.cusip),
    index("idx_securities_ticker").on(table.ticker),
    index("idx_securities_slug").on(table.slug),
    index("idx_securities_sector").on(table.sector),
  ]
);

export type Security = typeof securities.$inferSelect;
export type NewSecurity = typeof securities.$inferInsert;

// =============================================================================
// 4. FILINGS_13F — Raw 13F filing metadata
// =============================================================================
// One row per quarterly 13F filing per investor. This is the source of truth
// for when data was reported vs when it was filed with the SEC.
// =============================================================================

export const filings13f = sqliteTable(
  "filings_13f",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    investorId: integer("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "cascade" }),

    // SEC filing metadata
    accessionNumber: text("accession_number").notNull().unique(), // SEC accession number
    filingDate: text("filing_date").notNull(), // Date filed with SEC (YYYY-MM-DD)
    reportDate: text("report_date").notNull(), // End of quarter reported (YYYY-MM-DD)
    quarter: integer("quarter").notNull(), // Calendar quarter (1-4)
    year: integer("year").notNull(),

    // Aggregate data from filing
    totalValue: real("total_value"), // Total portfolio value in $thousands (as reported)
    positionCount: integer("position_count"), // Number of distinct positions in filing
    filingUrl: text("filing_url"), // Direct URL to SEC filing

    // Processing status
    processed: integer("processed").notNull().default(0), // 1 = holdings extracted
    rawXml: text("raw_xml"), // Raw 13F XML (optional, for reprocessing)

    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("idx_filings_investor").on(table.investorId),
    index("idx_filings_quarter").on(table.year, table.quarter),
    index("idx_filings_report_date").on(table.reportDate),
    uniqueIndex("idx_filings_investor_quarter").on(
      table.investorId,
      table.year,
      table.quarter
    ),
  ]
);

export type Filing13f = typeof filings13f.$inferSelect;
export type NewFiling13f = typeof filings13f.$inferInsert;

// =============================================================================
// 5. HOLDINGS — Current portfolio snapshot for each investor
// =============================================================================
// Contains the LATEST positions only. Overwritten each quarter when new 13F
// is processed. For historical data, see holdingsHistory.
// This table enables fast "show me Buffett's current portfolio" queries.
// =============================================================================

export const holdings = sqliteTable(
  "holdings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    investorId: integer("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "cascade" }),
    securityId: integer("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),
    filingId: integer("filing_id").references(() => filings13f.id, {
      onDelete: "set null",
    }),

    // Position data (from 13F)
    shares: integer("shares").notNull(), // Number of shares held
    value: real("value").notNull(), // Market value in $thousands (as reported)
    pctOfPortfolio: real("pct_of_portfolio"), // This position as % of total portfolio (0-100)

    // Classification (from 13F)
    putCall: text("put_call"), // 'PUT' | 'CALL' | null (options only)
    investmentDiscretion: text("investment_discretion").default("SOLE"), // SOLE | SHARED | OTHER

    // Derived / editorial
    positionRank: integer("position_rank"), // Rank by % of portfolio (1 = largest)

    // Dates
    reportDate: text("report_date").notNull(), // Quarter end date this snapshot represents
    filingDate: text("filing_date"), // When the 13F was filed

    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("idx_holdings_investor").on(table.investorId),
    index("idx_holdings_security").on(table.securityId),
    index("idx_holdings_pct").on(table.pctOfPortfolio),
    uniqueIndex("idx_holdings_investor_security").on(
      table.investorId,
      table.securityId
    ),
  ]
);

export type Holding = typeof holdings.$inferSelect;
export type NewHolding = typeof holdings.$inferInsert;

// =============================================================================
// 6. HOLDINGS HISTORY — Full historical record of every position ever held
// =============================================================================
// One row per investor-security-quarter. Never deleted, only appended.
// This is the core data for tracking position evolution over time.
// =============================================================================

export const holdingsHistory = sqliteTable(
  "holdings_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    investorId: integer("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "cascade" }),
    securityId: integer("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),
    filingId: integer("filing_id").references(() => filings13f.id, {
      onDelete: "set null",
    }),

    // Time dimension
    year: integer("year").notNull(),
    quarter: integer("quarter").notNull(), // 1-4
    reportDate: text("report_date").notNull(), // Quarter end date (YYYY-MM-DD)
    filingDate: text("filing_date"),

    // Position data
    shares: integer("shares").notNull(),
    value: real("value").notNull(), // Market value in $thousands
    pctOfPortfolio: real("pct_of_portfolio"), // % of total portfolio (0-100)

    // Classification
    putCall: text("put_call"), // 'PUT' | 'CALL' | null
    investmentDiscretion: text("investment_discretion").default("SOLE"),

    // Derived
    positionRank: integer("position_rank"),

    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("idx_hh_investor").on(table.investorId),
    index("idx_hh_security").on(table.securityId),
    index("idx_hh_quarter").on(table.year, table.quarter),
    index("idx_hh_investor_quarter").on(
      table.investorId,
      table.year,
      table.quarter
    ),
    index("idx_hh_security_quarter").on(
      table.securityId,
      table.year,
      table.quarter
    ),
    index("idx_hh_investor_security").on(
      table.investorId,
      table.securityId,
      table.year,
      table.quarter
    ),
    uniqueIndex("idx_hh_unique").on(
      table.investorId,
      table.securityId,
      table.year,
      table.quarter
    ),
  ]
);

export type HoldingHistory = typeof holdingsHistory.$inferSelect;
export type NewHoldingHistory = typeof holdingsHistory.$inferInsert;

// =============================================================================
// 7. POSITION CHANGES — Quarter-over-quarter changes (derived from history)
// =============================================================================
// Computed when a new 13F is processed by comparing to previous quarter.
// Powers the "What changed?" view on investor pages.
// =============================================================================

export const positionChanges = sqliteTable(
  "position_changes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    investorId: integer("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "cascade" }),
    securityId: integer("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),
    filingId: integer("filing_id").references(() => filings13f.id, {
      onDelete: "set null",
    }),

    // Time dimension
    year: integer("year").notNull(),
    quarter: integer("quarter").notNull(), // 1-4
    reportDate: text("report_date").notNull(),

    // Change classification
    // Valid values: 'new' | 'increased' | 'decreased' | 'sold_out' | 'unchanged'
    changeType: text("change_type").notNull(),

    // Quantitative change
    sharesBefore: integer("shares_before").default(0), // Shares held previous quarter (0 if new)
    sharesAfter: integer("shares_after").default(0), // Shares held this quarter (0 if sold_out)
    sharesChange: integer("shares_change").notNull(), // sharesAfter - sharesBefore
    sharesChangePct: real("shares_change_pct"), // % change in shares (null if new)

    valueBefore: real("value_before").default(0), // Value previous quarter ($thousands)
    valueAfter: real("value_after").default(0), // Value this quarter ($thousands)
    valueChange: real("value_change"), // valueAfter - valueBefore

    pctOfPortfolioBefore: real("pct_of_portfolio_before").default(0),
    pctOfPortfolioAfter: real("pct_of_portfolio_after").default(0),

    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("idx_pc_investor").on(table.investorId),
    index("idx_pc_security").on(table.securityId),
    index("idx_pc_quarter").on(table.year, table.quarter),
    index("idx_pc_change_type").on(table.changeType),
    index("idx_pc_type_quarter").on(
      table.changeType,
      table.year,
      table.quarter
    ),
    uniqueIndex("idx_pc_unique").on(
      table.investorId,
      table.securityId,
      table.year,
      table.quarter
    ),
  ]
);

export type PositionChange = typeof positionChanges.$inferSelect;
export type NewPositionChange = typeof positionChanges.$inferInsert;

// =============================================================================
// 8. AI THESES — AI-generated investment theses per investor-stock pair
// =============================================================================
// When an investor holds or buys a stock, we generate an AI thesis explaining
// WHY they likely hold it, how it fits their style, and our risk assessment.
// =============================================================================

export const aiTheses = sqliteTable(
  "ai_theses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    investorId: integer("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "cascade" }),
    securityId: integer("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),

    // Thesis content
    // Valid values: 'initial_buy' | 'position_increase' | 'position_decrease' | 'exit' | 'quarterly_update' | 'deep_dive'
    thesisType: text("thesis_type").notNull(),
    title: text("title").notNull(), // e.g. "Why Buffett Likely Bought XYZ"
    summary: text("summary"), // 2-3 sentence TL;DR
    thesisBody: text("thesis_body").notNull(), // Full thesis (Markdown, 500-2000 words)

    // Style fit analysis
    styleFitScore: integer("style_fit_score"), // 1-10: How well does this fit their known style?
    styleFitNotes: text("style_fit_notes"),

    // Risk assessment
    riskLevel: text("risk_level"), // 'low' | 'medium' | 'high' | 'very_high'
    riskNotes: text("risk_notes"),

    // Generation metadata
    modelUsed: text("model_used"), // e.g. "claude-opus-4-6", "gpt-4o"
    promptVersion: text("prompt_version"), // Version of prompt template used
    generationDate: text("generation_date").notNull(),

    // Context: which quarter triggered this thesis
    triggerYear: integer("trigger_year"),
    triggerQuarter: integer("trigger_quarter"),

    // Editorial
    published: integer("published").notNull().default(0), // 1 = visible on site
    editorNotes: text("editor_notes"),

    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("idx_theses_investor").on(table.investorId),
    index("idx_theses_security").on(table.securityId),
    index("idx_theses_pair").on(table.investorId, table.securityId),
    index("idx_theses_published").on(table.published),
    index("idx_theses_type").on(table.thesisType),
  ]
);

export type AiThesis = typeof aiTheses.$inferSelect;
export type NewAiThesis = typeof aiTheses.$inferInsert;

// =============================================================================
// 9. BEST IDEAS — Curated rankings of top stock ideas
// =============================================================================
// Our editorial "best ideas" list, updated quarterly. Combines investor
// overlap, conviction sizing, and our own analysis.
// =============================================================================

export const bestIdeas = sqliteTable(
  "best_ideas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    securityId: integer("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),

    // Ranking period
    year: integer("year").notNull(),
    quarter: integer("quarter").notNull(), // 1-4

    // Ranking data
    rank: integer("rank").notNull(), // 1 = top idea
    score: real("score"), // Composite score (0-100)

    // Cross-investor analysis
    investorCount: integer("investor_count").notNull().default(0), // How many tracked investors hold this
    investorIds: text("investor_ids"), // JSON array of investor IDs who hold it
    totalValueHeld: real("total_value_held"), // Combined value held ($thousands)
    avgPctOfPortfolio: real("avg_pct_of_portfolio"), // Average portfolio weight across holders

    // Our analysis
    reasoning: text("reasoning"), // Why this is a best idea (Markdown)
    // Valid values: 'high_conviction' | 'contrarian' | 'new_consensus' | 'compounder' | 'special_situation'
    category: text("category"),

    // Status
    published: integer("published").notNull().default(0),

    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("idx_bi_quarter").on(table.year, table.quarter),
    index("idx_bi_rank").on(table.year, table.quarter, table.rank),
    index("idx_bi_security").on(table.securityId),
    uniqueIndex("idx_bi_unique").on(
      table.securityId,
      table.year,
      table.quarter
    ),
  ]
);

export type BestIdea = typeof bestIdeas.$inferSelect;
export type NewBestIdea = typeof bestIdeas.$inferInsert;

// =============================================================================
// 10. INVESTOR STOCK OVERLAP — Cross-investor analysis (materialized view)
// =============================================================================
// Precomputed table showing which investors share positions. Enables
// "Who else owns AAPL?" without expensive joins at query time.
// =============================================================================

export const investorStockOverlap = sqliteTable(
  "investor_stock_overlap",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    securityId: integer("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),

    // Snapshot period
    year: integer("year").notNull(),
    quarter: integer("quarter").notNull(), // 1-4

    // Overlap data
    holderCount: integer("holder_count").notNull().default(0),
    holderInvestorIds: text("holder_investor_ids"), // JSON array of investor IDs
    holderNames: text("holder_names"), // JSON array of investor names (denormalized)
    totalShares: integer("total_shares"),
    totalValue: real("total_value"), // Combined value ($thousands)
    avgPortfolioWeight: real("avg_portfolio_weight"),
    maxPortfolioWeight: real("max_portfolio_weight"),
    maxWeightInvestorId: integer("max_weight_investor_id").references(
      () => investors.id
    ),

    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("idx_iso_quarter").on(table.year, table.quarter),
    index("idx_iso_holder_count").on(table.holderCount),
    index("idx_iso_security").on(table.securityId),
    uniqueIndex("idx_iso_unique").on(
      table.securityId,
      table.year,
      table.quarter
    ),
  ]
);

export type InvestorStockOverlap = typeof investorStockOverlap.$inferSelect;
export type NewInvestorStockOverlap = typeof investorStockOverlap.$inferInsert;

// =============================================================================
// 11. CONTENT — Blog posts, analysis articles, commentary
// =============================================================================

export const content = sqliteTable(
  "content",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    // Content metadata
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    // Valid values: 'article' | 'quarterly_recap' | 'investor_profile' | 'stock_spotlight' | 'methodology' | 'announcement'
    contentType: text("content_type").notNull(),

    // Content body
    summary: text("summary"), // Short excerpt for cards/previews
    body: text("body").notNull(), // Full content (Markdown)
    coverImageUrl: text("cover_image_url"),

    // Relationships (optional)
    investorId: integer("investor_id").references(() => investors.id, {
      onDelete: "set null",
    }),
    securityId: integer("security_id").references(() => securities.id, {
      onDelete: "set null",
    }),

    // Publishing
    status: text("status").notNull().default("draft"), // 'draft' | 'published' | 'archived'
    publishedAt: text("published_at"),
    author: text("author").default("SuperInvestors"),

    // SEO
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),

    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("idx_content_slug").on(table.slug),
    index("idx_content_type").on(table.contentType),
    index("idx_content_status").on(table.status),
    index("idx_content_published").on(table.publishedAt),
    index("idx_content_investor").on(table.investorId),
    index("idx_content_security").on(table.securityId),
  ]
);

export type Content = typeof content.$inferSelect;
export type NewContent = typeof content.$inferInsert;

// =============================================================================
// 12. TAGS — Flexible tagging for content and securities
// =============================================================================

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(), // e.g. "value-investing", "tech"
  slug: text("slug").notNull().unique(),
  // Valid values: 'general' | 'sector' | 'theme' | 'quarter' | 'strategy'
  tagType: text("tag_type").default("general"),

  createdAt: text("created_at").notNull().default(now),
});

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

// Junction table: content <-> tags (many-to-many)
export const contentTags = sqliteTable(
  "content_tags",
  {
    contentId: integer("content_id")
      .notNull()
      .references(() => content.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    // Composite primary key via unique index
    uniqueIndex("idx_content_tags_pk").on(table.contentId, table.tagId),
  ]
);

// Junction table: securities <-> tags (many-to-many)
export const securityTags = sqliteTable(
  "security_tags",
  {
    securityId: integer("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("idx_security_tags_pk").on(table.securityId, table.tagId),
  ]
);

// =============================================================================
// 13. DATA PIPELINE STATE — Track ETL processing status
// =============================================================================
// Tracks the state of our data pipeline so we know what has been processed,
// what failed, and what needs reprocessing.
// =============================================================================

export const pipelineRuns = sqliteTable(
  "pipeline_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Valid values: 'fetch_13f' | 'parse_13f' | 'compute_changes' | 'compute_overlap' | 'generate_theses' | 'compute_best_ideas' | 'full_refresh'
    runType: text("run_type").notNull(),
    investorId: integer("investor_id").references(() => investors.id, {
      onDelete: "set null",
    }),

    // Run details
    year: integer("year"),
    quarter: integer("quarter"),
    status: text("status").notNull().default("running"), // 'running' | 'completed' | 'failed' | 'partial'
    recordsProcessed: integer("records_processed").default(0),
    errorMessage: text("error_message"),

    startedAt: text("started_at").notNull().default(now),
    completedAt: text("completed_at"),

    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    index("idx_pipeline_type").on(table.runType),
    index("idx_pipeline_status").on(table.status),
  ]
);

export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type NewPipelineRun = typeof pipelineRuns.$inferInsert;
