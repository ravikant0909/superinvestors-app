import Database from 'better-sqlite3'
import path from 'path'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(process.cwd(), 'superinvestors.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  }
  return db
}

// Helper to get all investors
export function getInvestors() {
  const db = getDb()
  return db.prepare(`
    SELECT
      i.*,
      s.philosophy_score as philosophy_alignment, s.concentration_score as concentration, s.rationality_score as rationality,
      s.integrity_score as integrity, s.track_record_score as track_record, s.transparency_score as transparency,
      s.relevance_score as relevance, s.agi_awareness_score as agi_awareness, s.composite_score as combined_score
    FROM investors i
    LEFT JOIN investor_scores s ON i.id = s.investor_id
    WHERE i.active = 1
    ORDER BY s.composite_score DESC
  `).all()
}

// Helper to get a single investor by slug
export function getInvestor(slug: string) {
  const db = getDb()
  return db.prepare(`
    SELECT
      i.*,
      s.philosophy_score as philosophy_alignment, s.concentration_score as concentration, s.rationality_score as rationality,
      s.integrity_score as integrity, s.track_record_score as track_record, s.transparency_score as transparency,
      s.relevance_score as relevance, s.agi_awareness_score as agi_awareness, s.composite_score as combined_score
    FROM investors i
    LEFT JOIN investor_scores s ON i.id = s.investor_id
    WHERE i.slug = ?
  `).get(slug)
}

// Helper to get holdings for an investor
export function getHoldings(investorId: number) {
  const db = getDb()
  return db.prepare(`
    SELECT
      h.*,
      h.value as value_thousands,
      h.pct_of_portfolio as portfolio_percent,
      sec.ticker, sec.name as security_name, sec.sector, sec.industry
    FROM holdings h
    JOIN securities sec ON h.security_id = sec.id
    WHERE h.investor_id = ?
    ORDER BY h.pct_of_portfolio DESC
  `).all(investorId)
}

// Helper to get position changes for an investor
export function getPositionChanges(investorId: number, limit: number = 50) {
  const db = getDb()
  return db.prepare(`
    SELECT
      pc.*,
      sec.ticker, sec.name as security_name, sec.sector,
      i.name as investor_name, i.slug as investor_slug
    FROM position_changes pc
    JOIN securities sec ON pc.security_id = sec.id
    JOIN investors i ON pc.investor_id = i.id
    WHERE pc.investor_id = ?
    ORDER BY pc.report_date DESC, ABS(pc.value_change) DESC
    LIMIT ?
  `).all(investorId, limit)
}

// Helper to get all recent changes
export function getRecentChanges(limit: number = 100) {
  const db = getDb()
  return db.prepare(`
    SELECT
      pc.*,
      sec.ticker, sec.name as security_name, sec.sector,
      i.name as investor_name, i.slug as investor_slug,
      i.firm_name as investor_firm
    FROM position_changes pc
    JOIN securities sec ON pc.security_id = sec.id
    JOIN investors i ON pc.investor_id = i.id
    ORDER BY pc.report_date DESC, ABS(pc.value_change) DESC
    LIMIT ?
  `).all(limit)
}

// Helper to get stock holders
export function getStockHolders(ticker: string) {
  const db = getDb()
  return db.prepare(`
    SELECT
      h.*,
      h.value as value_thousands,
      h.pct_of_portfolio as portfolio_percent,
      i.name as investor_name, i.slug as investor_slug,
      i.firm_name as investor_firm,
      s2.composite_score as investor_score
    FROM holdings h
    JOIN securities sec ON h.security_id = sec.id
    JOIN investors i ON h.investor_id = i.id
    LEFT JOIN investor_scores s2 ON i.id = s2.investor_id
    WHERE sec.ticker = ?
    ORDER BY h.pct_of_portfolio DESC
  `).all(ticker)
}

// Helper to get best ideas (most widely held stocks)
export function getBestIdeas(limit: number = 20) {
  const db = getDb()
  return db.prepare(`
    SELECT
      sec.ticker, sec.name, sec.sector,
      COUNT(DISTINCT h.investor_id) as holder_count,
      SUM(h.value) as total_value,
      AVG(h.pct_of_portfolio) as avg_weight,
      GROUP_CONCAT(DISTINCT i.name) as holder_names
    FROM holdings h
    JOIN securities sec ON h.security_id = sec.id
    JOIN investors i ON h.investor_id = i.id
    GROUP BY sec.id
    HAVING holder_count >= 2
    ORDER BY holder_count DESC, total_value DESC
    LIMIT ?
  `).all(limit)
}

// Score color helper
export function scoreColor(score: number): string {
  if (score >= 8.0) return 'score-green'
  if (score >= 7.0) return 'score-blue'
  if (score >= 6.0) return 'score-yellow'
  if (score >= 5.0) return 'score-orange'
  return 'score-red'
}

export function verdictBadge(verdict: string): string {
  switch (verdict?.toLowerCase()) {
    case 'follow': case 'strong_follow': return 'badge-follow'
    case 'watch': return 'badge-watch'
    default: return 'badge-skip'
  }
}

export function changeBadge(changeType: string): string {
  switch (changeType?.toLowerCase()) {
    case 'new': return 'badge-new'
    case 'increased': return 'badge-increased'
    case 'decreased': return 'badge-decreased'
    case 'sold_out': return 'badge-sold'
    default: return ''
  }
}
