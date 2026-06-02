// =============================================================================
// SuperInvestors API Worker
// =============================================================================
// Serves D1-backed API endpoints and the Claude chat proxy.
// Static assets are served by Cloudflare Pages.
// =============================================================================

// ─── Chat Configuration ─────────────────────────────────────────────────────

const CHAT_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are the research assistant for SuperInvestors (superinvestors-app.pages.dev), a site tracking ~150 legendary value investors' SEC 13F portfolio holdings, position changes, cross-investor overlap, and conviction analyses. The data reflects the most recently loaded 13F quarter and carries the standard ~45-day filing delay.

You have tools that query the LIVE SuperInvestors database. You MUST use them to answer any factual question about who owns a stock, an investor's holdings, recent position changes, or consensus ("best") ideas.

Hard rules on grounding:
- NEVER state a holder, holding, share count, weight, or number from your own memory. Only report what a tool actually returned.
- If a tool returns no matching rows, say so plainly (e.g. "None of the tracked investors report holding X in the latest 13F data") and do NOT invent or guess holders.
- Do not claim the database lacks data without first calling the relevant tool.

Current page context: {context}

Other rules:
- Cite the data when you use it ("According to the latest 13F data...").
- Do not give investment advice or buy/sell recommendations.
- Remember 13F data is long US-equity only, quarterly, and ~45 days delayed; note this limitation when relevant.
- If the user suggests a site improvement, acknowledge it warmly and note it has been logged.
- Be concise.`;

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const rateLimitMap = new Map();

// KV-backed rate limit when env.CACHE is bound; falls back to per-isolate memory.
async function isRateLimited(sessionId, env) {
  const now = Date.now();
  if (env && env.CACHE) {
    try {
      const key = `rl:${sessionId}`;
      const raw = await env.CACHE.get(key);
      const entry = raw ? JSON.parse(raw) : null;
      const ttl = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
      if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        await env.CACHE.put(key, JSON.stringify({ count: 1, windowStart: now }), { expirationTtl: ttl });
        return false;
      }
      if (entry.count >= RATE_LIMIT_MAX) return true;
      entry.count++;
      await env.CACHE.put(key, JSON.stringify(entry), { expirationTtl: ttl });
      return false;
    } catch (err) {
      console.error('KV rate-limit error, falling back to memory:', err);
    }
  }
  const entry = rateLimitMap.get(sessionId);
  if (!entry) {
    rateLimitMap.set(sessionId, { count: 1, windowStart: now });
    return false;
  }
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(sessionId, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

// ─── Chat Tools (D1-grounded) ─────────────────────────────────────────────────

const CHAT_TOOLS = [
  {
    name: 'get_holders',
    description: 'List the tracked superinvestors who currently report holding a given stock (by ticker), with each position\'s portfolio weight and value. Use for "who owns X" / "which investors hold X" questions.',
    input_schema: {
      type: 'object',
      properties: { ticker: { type: 'string', description: 'US stock ticker symbol, e.g. AMZN, META, BRK-A' } },
      required: ['ticker'],
    },
  },
  {
    name: 'get_investor',
    description: 'Look up one investor by name or slug and return their profile (firm, verdict, composite score, latest filing date) plus their largest current holdings.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Investor name or slug, e.g. "warren buffett" or "warren-buffett"' } },
      required: ['query'],
    },
  },
  {
    name: 'get_changes',
    description: 'Return the most significant recent position changes (buys/sells/new/exit) across all tracked investors, most recent quarter first. Optionally filter to a single stock by ticker.',
    input_schema: {
      type: 'object',
      properties: { ticker: { type: 'string', description: 'Optional ticker to filter changes to one stock' } },
      required: [],
    },
  },
  {
    name: 'get_best_ideas',
    description: 'Return the top consensus stock ideas held by multiple tracked superinvestors, ranked by number of holders and average portfolio weight.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'How many to return (default 15)' } },
      required: [],
    },
  },
];

function slugifyQuery(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

async function executeChatTool(name, input, env) {
  try {
    if (name === 'get_holders') {
      const ticker = String(input?.ticker || '').trim().toUpperCase();
      if (!ticker) return { error: 'ticker is required' };
      const { results } = await env.DB.prepare(`
        SELECT i.name AS investor, i.firm_name AS firm, i.slug,
               h.pct_of_portfolio AS portfolio_pct, h.value AS value_thousands, h.report_date
        FROM holdings h
        JOIN securities sec ON h.security_id = sec.id
        JOIN investors i ON h.investor_id = i.id
        WHERE UPPER(sec.ticker) = ?
        ORDER BY h.pct_of_portfolio DESC
      `).bind(ticker).all();
      return {
        ticker,
        holder_count: results.length,
        holders: results,
        note: results.length === 0
          ? `No tracked investor reports holding ${ticker} in the latest 13F data.`
          : undefined,
      };
    }

    if (name === 'get_investor') {
      const raw = String(input?.query || '').trim();
      if (!raw) return { error: 'query is required' };
      const slug = slugifyQuery(raw);
      const like = `%${raw.toLowerCase()}%`;
      const investor = await env.DB.prepare(`
        SELECT i.id, i.name, i.slug, i.firm_name, i.verdict_follow, i.verdict_summary,
               s.composite_score,
               (SELECT MAX(report_date) FROM filings_13f f WHERE f.investor_id = i.id) AS latest_report_date,
               (SELECT COUNT(*) FROM filings_13f f WHERE f.investor_id = i.id) AS filings_count
        FROM investors i
        LEFT JOIN investor_scores s ON i.id = s.investor_id
        WHERE i.slug = ? OR LOWER(i.name) LIKE ?
        ORDER BY (i.slug = ?) DESC
        LIMIT 1
      `).bind(slug, like, slug).first();
      if (!investor) return { found: false, note: `No tracked investor matches "${raw}".` };
      const { results: holdings } = await env.DB.prepare(`
        SELECT sec.ticker, sec.name AS security, h.pct_of_portfolio AS portfolio_pct, h.value AS value_thousands
        FROM holdings h
        JOIN securities sec ON h.security_id = sec.id
        WHERE h.investor_id = ?
        ORDER BY h.pct_of_portfolio DESC
        LIMIT 15
      `).bind(investor.id).all();
      return { found: true, investor, top_holdings: holdings };
    }

    if (name === 'get_changes') {
      const ticker = String(input?.ticker || '').trim().toUpperCase();
      const base = `
        SELECT UPPER(pc.change_type) AS action, i.name AS investor, i.slug AS investor_slug,
               sec.ticker, sec.name AS security,
               pc.value_change AS value_change_thousands, pc.pct_of_portfolio_after AS portfolio_pct_after,
               pc.year, pc.quarter, pc.report_date
        FROM position_changes pc
        JOIN investors i ON pc.investor_id = i.id
        JOIN securities sec ON pc.security_id = sec.id
      `;
      const order = ` ORDER BY pc.year DESC, pc.quarter DESC, ABS(COALESCE(pc.value_change, 0)) DESC LIMIT 25`;
      const stmt = ticker
        ? env.DB.prepare(base + ` WHERE UPPER(sec.ticker) = ?` + order).bind(ticker)
        : env.DB.prepare(base + order);
      const { results } = await stmt.all();
      return { ticker: ticker || null, count: results.length, changes: results };
    }

    if (name === 'get_best_ideas') {
      const limit = Math.min(Math.max(parseInt(input?.limit, 10) || 15, 1), 50);
      const { results } = await env.DB.prepare(`
        SELECT sec.ticker, sec.name AS security,
               COUNT(DISTINCT h.investor_id) AS holder_count,
               AVG(h.pct_of_portfolio) AS avg_weight,
               SUM(h.value) AS total_value_thousands
        FROM holdings h
        JOIN securities sec ON h.security_id = sec.id
        JOIN investors i ON h.investor_id = i.id
        WHERE sec.ticker IS NOT NULL
        GROUP BY sec.id
        HAVING holder_count >= 2
        ORDER BY holder_count DESC, avg_weight DESC
        LIMIT ?
      `).bind(limit).all();
      return { count: results.length, ideas: results };
    }

    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    console.error(`Tool ${name} error:`, err);
    return { error: `Tool ${name} failed: ${err.message}` };
  }
}

// Runs the Claude tool-use loop and returns the final grounded answer text.
async function runGroundedChat(messages, systemPrompt, env) {
  for (let round = 0; round < 5; round++) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: CHAT_TOOLS,
        messages,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Anthropic API ${resp.status}: ${text}`);
    }

    const data = await resp.json();
    const blocks = Array.isArray(data.content) ? data.content : [];
    const toolUses = blocks.filter((b) => b.type === 'tool_use');

    if (data.stop_reason === 'tool_use' && toolUses.length > 0) {
      messages.push({ role: 'assistant', content: blocks });
      const toolResults = [];
      for (const tu of toolUses) {
        const result = await executeChatTool(tu.name, tu.input, env);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result).slice(0, 8000),
        });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return text || "I'm not sure how to answer that from the data.";
  }
  return "I looked but couldn't pull that together from the data right now. Try rephrasing?";
}

// ─── Finnhub Price Fetching ─────────────────────────────────────────────────

async function fetchPricesFromFinnhub(symbols, apiKey) {
  const prices = [];
  const batchSize = 10;
  const batches = [];
  for (let i = 0; i < symbols.length; i += batchSize) {
    batches.push(symbols.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(async (symbol) => {
        try {
          const response = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`
          );
          if (!response.ok) return null;
          const data = await response.json();
          if (data.c && data.c > 0) {
            return { symbol, price: data.c, change: data.d, changePercent: data.dp };
          }
          return null;
        } catch (e) {
          console.error(`Error fetching ${symbol}:`, e);
          return null;
        }
      })
    );
    prices.push(...results.filter(Boolean));
  }
  return prices;
}

// ─── JSON Response Helpers ──────────────────────────────────────────────────

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── API Router ─────────────────────────────────────────────────────────────

async function handleAPI(path, request, env) {
  const method = request.method;
  const url = new URL(request.url);

  // ── Investors ───────────────────────────────────────────────────────────

  // GET /api/investors — list investors with scores
  if (path === '/api/investors' && method === 'GET') {
    const activeOnly = url.searchParams.get('active_only') === '1';
    try {
      const query = `
        SELECT
          i.id, i.name, i.slug, i.firm_name, i.style, i.aum_range, i.active,
          i.verdict_follow, i.verdict_summary, i.photo_url,
          COALESCE(f.filings_count, 0) AS filings_count,
          f.latest_report_date,
          s.philosophy_score, s.concentration_score, s.rationality_score,
          s.integrity_score, s.track_record_score, s.transparency_score,
          s.relevance_score, s.agi_awareness_score, s.composite_score
        FROM investors i
        LEFT JOIN investor_scores s ON i.id = s.investor_id
        LEFT JOIN (
          SELECT investor_id, COUNT(*) AS filings_count, MAX(report_date) AS latest_report_date
          FROM filings_13f
          GROUP BY investor_id
        ) f ON i.id = f.investor_id
        ${activeOnly ? 'WHERE i.active = 1' : ''}
        ORDER BY
          CASE WHEN s.composite_score IS NULL THEN 1 ELSE 0 END,
          s.composite_score DESC,
          i.name ASC
      `;
      const { results } = await env.DB.prepare(query).all();
      return jsonResponse(results);
    } catch (err) {
      console.error('Error fetching investors:', err);
      return errorResponse('Failed to fetch investors');
    }
  }

  // GET /api/holdings — all current holdings across all tracked investors
  if (path === '/api/holdings' && method === 'GET') {
    const activeOnly = url.searchParams.get('active_only') === '1';
    try {
      const query = `
        SELECT
          h.shares, h.value, h.pct_of_portfolio, h.position_rank,
          h.report_date, h.filing_date, h.put_call,
          i.id AS investor_id, i.name AS investor_name, i.slug AS investor_slug,
          i.firm_name AS investor_firm, i.active,
          i.verdict_follow, s.composite_score AS investor_score,
          sec.ticker, sec.name AS security_name, sec.cusip, sec.sector, sec.slug AS security_slug
        FROM holdings h
        JOIN investors i ON h.investor_id = i.id
        LEFT JOIN investor_scores s ON i.id = s.investor_id
        JOIN securities sec ON h.security_id = sec.id
        ${activeOnly ? 'WHERE i.active = 1' : ''}
        ORDER BY i.name, h.pct_of_portfolio DESC
      `;
      const { results } = await env.DB.prepare(query).all();
      return jsonResponse(results);
    } catch (err) {
      console.error('Error fetching holdings:', err);
      return errorResponse('Failed to fetch holdings');
    }
  }

  // GET /api/investor/:slug — full investor profile
  const investorMatch = path.match(/^\/api\/investor\/([^/]+)$/);
  if (investorMatch && method === 'GET') {
    const slug = investorMatch[1];
    try {
      // Investor + scores
      const investor = await env.DB.prepare(`
        SELECT
          i.*,
          (SELECT COUNT(*) FROM filings_13f f WHERE f.investor_id = i.id) AS filings_count,
          (SELECT MAX(report_date) FROM filings_13f f WHERE f.investor_id = i.id) AS latest_report_date,
          s.philosophy_score, s.concentration_score, s.rationality_score,
          s.integrity_score, s.track_record_score, s.transparency_score,
          s.relevance_score, s.agi_awareness_score, s.composite_score,
          s.score_notes
        FROM investors i
        LEFT JOIN investor_scores s ON i.id = s.investor_id
        WHERE i.slug = ?
      `).bind(slug).first();

      if (!investor) {
        return errorResponse('Investor not found', 404);
      }

      // Current holdings
      const { results: holdings } = await env.DB.prepare(`
        SELECT
          h.shares, h.value, h.pct_of_portfolio, h.position_rank,
          h.report_date, h.filing_date,
          sec.ticker, sec.name, sec.sector, sec.cusip, sec.slug AS security_slug
        FROM holdings h
        JOIN securities sec ON h.security_id = sec.id
        WHERE h.investor_id = ?
        ORDER BY h.pct_of_portfolio DESC
      `).bind(investor.id).all();

      // Latest quarter's position changes
      const { results: recentChanges } = await env.DB.prepare(`
        SELECT
          UPPER(pc.change_type) AS change_type,
          pc.shares_before, pc.shares_after, pc.shares_change,
          pc.shares_change_pct, pc.value_before, pc.value_after, pc.value_change,
          pc.pct_of_portfolio_before, pc.pct_of_portfolio_after,
          pc.year, pc.quarter, pc.report_date,
          sec.ticker, sec.name, sec.slug AS security_slug
        FROM position_changes pc
        JOIN securities sec ON pc.security_id = sec.id
        WHERE pc.investor_id = ?
        ORDER BY pc.year DESC, pc.quarter DESC
        LIMIT 100
      `).bind(investor.id).all();

      // Only keep the latest quarter from the results
      let latestChanges = recentChanges;
      if (recentChanges.length > 0) {
        const latestYear = recentChanges[0].year;
        const latestQuarter = recentChanges[0].quarter;
        latestChanges = recentChanges.filter(
          (c) => c.year === latestYear && c.quarter === latestQuarter
        );
      }

      return jsonResponse({
        ...investor,
        holdings,
        recent_changes: latestChanges,
      });
    } catch (err) {
      console.error('Error fetching investor:', err);
      return errorResponse('Failed to fetch investor');
    }
  }

  // GET /api/investor/:slug/holdings — all current holdings
  const holdingsMatch = path.match(/^\/api\/investor\/([^/]+)\/holdings$/);
  if (holdingsMatch && method === 'GET') {
    const slug = holdingsMatch[1];
    try {
      const investor = await env.DB.prepare(
        'SELECT id FROM investors WHERE slug = ?'
      ).bind(slug).first();
      if (!investor) return errorResponse('Investor not found', 404);

      const { results } = await env.DB.prepare(`
        SELECT
          h.shares, h.value, h.pct_of_portfolio, h.position_rank,
          h.report_date, h.filing_date, h.put_call,
          sec.ticker, sec.name, sec.cusip, sec.sector, sec.slug AS security_slug
        FROM holdings h
        JOIN securities sec ON h.security_id = sec.id
        WHERE h.investor_id = ?
        ORDER BY h.pct_of_portfolio DESC
      `).bind(investor.id).all();
      return jsonResponse(results);
    } catch (err) {
      console.error('Error fetching holdings:', err);
      return errorResponse('Failed to fetch holdings');
    }
  }

  // GET /api/investor/:slug/track-record — full holdings history
  const trackRecordMatch = path.match(/^\/api\/investor\/([^/]+)\/track-record$/);
  if (trackRecordMatch && method === 'GET') {
    const slug = trackRecordMatch[1];
    try {
      const investor = await env.DB.prepare(
        'SELECT id FROM investors WHERE slug = ?'
      ).bind(slug).first();
      if (!investor) return errorResponse('Investor not found', 404);

      const { results } = await env.DB.prepare(`
        SELECT
          hh.year, hh.quarter, hh.report_date,
          hh.shares, hh.value, hh.pct_of_portfolio, hh.position_rank,
          sec.ticker, sec.name, sec.cusip, sec.slug AS security_slug
        FROM holdings_history hh
        JOIN securities sec ON hh.security_id = sec.id
        WHERE hh.investor_id = ?
        ORDER BY sec.ticker, hh.year, hh.quarter
      `).bind(investor.id).all();

      // Group by security for position timelines
      const grouped = {};
      for (const row of results) {
        const key = row.security_slug || row.ticker || row.cusip;
        if (!grouped[key]) {
          grouped[key] = {
            ticker: row.ticker,
            name: row.name,
            cusip: row.cusip,
            security_slug: row.security_slug,
            timeline: [],
          };
        }
        grouped[key].timeline.push({
          year: row.year,
          quarter: row.quarter,
          report_date: row.report_date,
          shares: row.shares,
          value: row.value,
          pct_of_portfolio: row.pct_of_portfolio,
          position_rank: row.position_rank,
        });
      }

      return jsonResponse(Object.values(grouped));
    } catch (err) {
      console.error('Error fetching track record:', err);
      return errorResponse('Failed to fetch track record');
    }
  }

  // GET /api/investor/:slug/changes — all position changes
  const changesMatch = path.match(/^\/api\/investor\/([^/]+)\/changes$/);
  if (changesMatch && method === 'GET') {
    const slug = changesMatch[1];
    try {
      const investor = await env.DB.prepare(
        'SELECT id FROM investors WHERE slug = ?'
      ).bind(slug).first();
      if (!investor) return errorResponse('Investor not found', 404);

      const { results } = await env.DB.prepare(`
        SELECT
          UPPER(pc.change_type) AS change_type,
          pc.shares_before, pc.shares_after, pc.shares_change,
          pc.shares_change_pct, pc.value_before, pc.value_after, pc.value_change,
          pc.pct_of_portfolio_before, pc.pct_of_portfolio_after,
          pc.year, pc.quarter, pc.report_date,
          sec.ticker, sec.name, sec.slug AS security_slug
        FROM position_changes pc
        JOIN securities sec ON pc.security_id = sec.id
        WHERE pc.investor_id = ?
        ORDER BY pc.year DESC, pc.quarter DESC
      `).bind(investor.id).all();
      return jsonResponse(results);
    } catch (err) {
      console.error('Error fetching changes:', err);
      return errorResponse('Failed to fetch changes');
    }
  }

  // ── Changes (cross-investor) ────────────────────────────────────────────

  // GET /api/changes?limit=500 — scored changes across all investors
  if (path === '/api/changes' && method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '500', 10);
    try {
      const { results } = await env.DB.prepare(`
        SELECT
          UPPER(pc.change_type) AS change_type,
          pc.shares_before, pc.shares_after, pc.shares_change,
          pc.shares_change_pct, pc.value_before, pc.value_after, pc.value_change,
          pc.pct_of_portfolio_before, pc.pct_of_portfolio_after,
          pc.year, pc.quarter, pc.report_date,
          i.name AS investor_name, i.slug AS investor_slug,
          i.firm_name AS investor_firm,
          s.composite_score AS investor_score,
          sec.ticker, sec.name AS security_name, sec.slug AS security_slug,
          -- importance_score: resulting position weight + dollar magnitude + investor quality.
          -- Deliberately NOT driven by shares_change_pct, which explodes to +50000%
          -- for tiny-base positions and used to dominate the feed with noise.
          -- value is in thousands of USD, so /1e6 expresses the move in $B.
          (
            COALESCE(pc.pct_of_portfolio_after, 0) +
            COALESCE(ABS(pc.value_change), 0) / 1000000.0 +
            COALESCE(s.composite_score, 0) * 2.0
          ) AS importance_score
        FROM position_changes pc
        JOIN investors i ON pc.investor_id = i.id
        LEFT JOIN investor_scores s ON i.id = s.investor_id
        JOIN securities sec ON pc.security_id = sec.id
        ORDER BY pc.year DESC, pc.quarter DESC, importance_score DESC
        LIMIT ?
      `).bind(limit).all();
      return jsonResponse(results);
    } catch (err) {
      console.error('Error fetching changes:', err);
      return errorResponse('Failed to fetch changes');
    }
  }

  // ── Best Ideas ──────────────────────────────────────────────────────────

  // GET /api/best-ideas — aggregate holdings across investors
  if (path === '/api/best-ideas' && method === 'GET') {
    try {
      const { results: aggregates } = await env.DB.prepare(`
        SELECT
          sec.id AS security_id,
          sec.ticker, sec.name, sec.slug AS security_slug, sec.sector,
          COUNT(DISTINCT h.investor_id) AS holder_count,
          AVG(h.pct_of_portfolio) AS avg_weight,
          SUM(h.value) AS total_value,
          AVG(s.composite_score) AS avg_investor_score,
          -- composite: holder_count * 3 + avg_weight + avg_investor_score * 2
          (
            COUNT(DISTINCT h.investor_id) * 3.0 +
            AVG(h.pct_of_portfolio) +
            AVG(s.composite_score) * 2.0
          ) AS composite_score
        FROM holdings h
        JOIN securities sec ON h.security_id = sec.id
        JOIN investors i ON h.investor_id = i.id
        LEFT JOIN investor_scores s ON i.id = s.investor_id
        WHERE sec.ticker IS NOT NULL
        GROUP BY sec.id
        HAVING holder_count >= 2
        ORDER BY composite_score DESC
        LIMIT 100
      `).all();

      if (!aggregates.length) {
        return jsonResponse([]);
      }

      const securityIds = aggregates.map((row) => row.security_id);
      const placeholders = securityIds.map(() => '?').join(', ');

      const { results: holderRows } = await env.DB.prepare(`
        SELECT
          h.security_id,
          h.pct_of_portfolio, h.value,
          i.name AS investor_name, i.slug AS investor_slug, i.firm_name AS investor_firm,
          i.verdict_follow, s.composite_score AS investor_score
        FROM holdings h
        JOIN investors i ON h.investor_id = i.id
        LEFT JOIN investor_scores s ON i.id = s.investor_id
        WHERE h.security_id IN (${placeholders})
        ORDER BY h.security_id, h.pct_of_portfolio DESC
      `).bind(...securityIds).all();

      const { results: changeRows } = await env.DB.prepare(`
        SELECT
          pc.security_id,
          UPPER(pc.change_type) AS change_type,
          pc.shares_change_pct, pc.year, pc.quarter,
          i.name AS investor_name, i.slug AS investor_slug
        FROM position_changes pc
        JOIN investors i ON pc.investor_id = i.id
        WHERE pc.security_id IN (${placeholders})
        ORDER BY pc.security_id, pc.year DESC, pc.quarter DESC, ABS(pc.value_change) DESC
      `).bind(...securityIds).all();

      const holdersBySecurity = new Map();
      for (const row of holderRows) {
        if (!holdersBySecurity.has(row.security_id)) {
          holdersBySecurity.set(row.security_id, []);
        }
        holdersBySecurity.get(row.security_id).push({
          investor_name: row.investor_name,
          investor_slug: row.investor_slug,
          investor_firm: row.investor_firm,
          verdict_follow: row.verdict_follow,
          investor_score: row.investor_score,
          weight_pct: row.pct_of_portfolio,
          value_thousands: row.value,
        });
      }

      const recentActivityBySecurity = new Map();
      for (const row of changeRows) {
        if (row.change_type !== 'NEW' && row.change_type !== 'INCREASED') {
          continue;
        }

        const quarterKey = `${row.year}-Q${row.quarter}`;
        const existing = recentActivityBySecurity.get(row.security_id);
        if (!existing) {
          recentActivityBySecurity.set(row.security_id, {
            latestQuarter: quarterKey,
            entries: [{
              investor_name: row.investor_name,
              investor_slug: row.investor_slug,
              change_type: row.change_type,
              shares_change_pct: row.shares_change_pct,
              quarter: quarterKey,
            }],
          });
          continue;
        }

        if (existing.latestQuarter !== quarterKey) {
          continue;
        }

        if (existing.entries.length < 6) {
          existing.entries.push({
            investor_name: row.investor_name,
            investor_slug: row.investor_slug,
            change_type: row.change_type,
            shares_change_pct: row.shares_change_pct,
            quarter: quarterKey,
          });
        }
      }

      const results = aggregates.map((row) => ({
        ...row,
        holders: holdersBySecurity.get(row.security_id) || [],
        recent_activity: recentActivityBySecurity.get(row.security_id)?.entries || [],
      }));

      return jsonResponse(results);
    } catch (err) {
      console.error('Error fetching best ideas:', err);
      return errorResponse('Failed to fetch best ideas');
    }
  }

  // ── Prices (Finnhub proxy with cache) ───────────────────────────────────

  // GET /api/prices?symbols=AAPL,GOOGL
  if (path === '/api/prices' && method === 'GET') {
    const symbolsParam = url.searchParams.get('symbols');
    if (!symbolsParam) {
      return errorResponse('symbols parameter is required', 400);
    }
    const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (symbols.length === 0) {
      return errorResponse('No valid symbols provided', 400);
    }
    if (symbols.length > 50) {
      return errorResponse('Maximum 50 symbols per request', 400);
    }

    try {
      const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
      const now = Date.now();
      const cachedPrices = {};
      const uncachedSymbols = [];

      // Check cache
      for (const symbol of symbols) {
        try {
          const cached = await env.DB.prepare(
            'SELECT price, change_val, change_pct, fetched_at FROM price_cache WHERE symbol = ?'
          ).bind(symbol).first();
          if (cached && (now - new Date(cached.fetched_at).getTime()) < CACHE_TTL_MS) {
            cachedPrices[symbol] = {
              symbol,
              price: cached.price,
              change: cached.change_val,
              changePercent: cached.change_pct,
              cached: true,
            };
          } else {
            uncachedSymbols.push(symbol);
          }
        } catch {
          uncachedSymbols.push(symbol);
        }
      }

      // Fetch uncached from Finnhub
      let freshPrices = [];
      if (uncachedSymbols.length > 0 && env.FINNHUB_API_KEY) {
        freshPrices = await fetchPricesFromFinnhub(uncachedSymbols, env.FINNHUB_API_KEY);

        // Update cache
        for (const p of freshPrices) {
          try {
            await env.DB.prepare(`
              INSERT INTO price_cache (symbol, price, change_val, change_pct, fetched_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(symbol) DO UPDATE SET
                price = excluded.price,
                change_val = excluded.change_val,
                change_pct = excluded.change_pct,
                fetched_at = excluded.fetched_at
            `).bind(
              p.symbol,
              p.price,
              p.change || 0,
              p.changePercent || 0,
              new Date().toISOString()
            ).run();
          } catch (cacheErr) {
            console.error(`Cache write error for ${p.symbol}:`, cacheErr);
          }
        }
      }

      // Combine cached + fresh
      const allPrices = { ...cachedPrices };
      for (const p of freshPrices) {
        allPrices[p.symbol] = { ...p, cached: false };
      }

      return jsonResponse({
        prices: Object.values(allPrices),
        fetched: freshPrices.length,
        cached: Object.keys(cachedPrices).length,
      });
    } catch (err) {
      console.error('Error fetching prices:', err);
      return errorResponse('Failed to fetch prices');
    }
  }

  // ── Chat (Claude API proxy) ─────────────────────────────────────────────

  // POST /api/chat — streaming Claude chat proxy
  if (path === '/api/chat' && method === 'POST') {
    return handleChat(request, env);
  }

  // ── 404 ─────────────────────────────────────────────────────────────────

  return errorResponse('Not found', 404);
}

// ─── Chat Handler ───────────────────────────────────────────────────────────

async function handleChat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  const { message, context, history, sessionId } = body;

  if (!message || typeof message !== 'string') {
    return errorResponse('message is required', 400);
  }
  if (!sessionId) {
    return errorResponse('sessionId is required', 400);
  }
  if (await isRateLimited(sessionId, env)) {
    return errorResponse('Rate limit exceeded. Try again later.', 429);
  }

  const systemPrompt = SYSTEM_PROMPT.replace('{context}', context || 'Homepage');

  const messages = [];
  if (Array.isArray(history)) {
    for (const msg of history.slice(-10)) {
      if (msg.role && typeof msg.content === 'string' && msg.content.trim()) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }
  messages.push({ role: 'user', content: message });

  // The grounded tool-loop runs to completion first, then we stream the final
  // answer back in chunks so the existing SSE frontend keeps working unchanged.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    let fullResponse = '';
    try {
      fullResponse = await runGroundedChat(messages, systemPrompt, env);
      const CHUNK = 60;
      for (let i = 0; i < fullResponse.length; i += CHUNK) {
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ text: fullResponse.slice(i, i + CHUNK) })}\n\n`)
        );
      }
      await writer.write(encoder.encode('data: [DONE]\n\n'));
      await writer.close();
    } catch (err) {
      console.error('Chat handler error:', err);
      try {
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ text: 'Sorry — I hit an error pulling that from the data. Please try again.' })}\n\n`)
        );
        await writer.write(encoder.encode('data: [DONE]\n\n'));
        await writer.close();
      } catch {
        // stream already torn down
      }
    }

    // Log to D1 (best-effort)
    try {
      const isSuggestion = /suggest|improve|feature|add|change.*site/i.test(message) ? 1 : 0;
      await env.DB.prepare(
        'INSERT INTO chat_logs (session_id, page_context, question, response, is_suggestion) VALUES (?, ?, ?, ?, ?)'
      ).bind(sessionId, context || null, message, fullResponse, isSuggestion).run();
    } catch (err) {
      console.error('D1 logging error:', err);
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// =============================================================================
// Entry Point
// =============================================================================

const CANONICAL_ORIGIN = 'https://superinvestors-app.pages.dev';

function isAllowedOrigin(origin) {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    return (
      host === 'superinvestors-app.pages.dev' ||
      host.endsWith('.superinvestors-app.pages.dev') || // Pages preview deploys
      host === 'superinvestors.ravikant0909.workers.dev' ||
      host === 'ravikant.dev' ||
      host.endsWith('.ravikant.dev') ||
      host === 'localhost' ||
      host === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

function buildCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : CANONICAL_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers — restricted to the SuperInvestors origins (was wildcard).
    const corsHeaders = buildCorsHeaders(request);

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // API Routes
      if (path.startsWith('/api/')) {
        const response = await handleAPI(path, request, env);
        // Add CORS headers to all API responses (skip redirects)
        if (response.status < 300 || response.status >= 400) {
          Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
        }
        return response;
      }

      if (path === '/') {
        return jsonResponse({
          service: 'superinvestors-api',
          pages_origin: 'https://superinvestors-app.pages.dev',
        });
      }

      return errorResponse('Not found', 404);
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};
