#!/bin/bash
# Daily price update + rebuild + deploy for SuperInvestors
# Run via cron: 0 18 * * 1-5 /Users/ravf/projects/superinvestors-app/data/update_prices.sh
# (6 PM daily, Mon-Fri, after US market close)
#
# Requires:
#   ~/.finnhub_token       (sources FINNHUB_API_KEY)
#   ~/.cloudflare_token    (sources CLOUDFLARE_API_TOKEN for wrangler deploy)

set -e

export PATH="/Users/ravf/.nvm/versions/node/v24.12.0/bin:/bin:/usr/bin:/usr/local/bin:$PATH"

if [ -f "$HOME/.finnhub_token" ]; then
  source "$HOME/.finnhub_token"
else
  echo "FATAL: $HOME/.finnhub_token missing -- can't fetch prices" >&2
  exit 1
fi

PROJECT="/Users/ravf/projects/superinvestors-app"
PYTHON="/Library/Developer/CommandLineTools/usr/bin/python3"
LOG="$PROJECT/data/price_update.log"

echo "$(date): Starting price update" >> "$LOG"

# Fetch current prices + historical quarter ranges
cd "$PROJECT/data"
$PYTHON fetch_prices.py >> "$LOG" 2>&1

# Rebuild static site
cd "$PROJECT"
source ~/.cloudflare_token 2>/dev/null
node node_modules/.bin/next build >> "$LOG" 2>&1

# Deploy to Cloudflare Pages
npx wrangler pages deploy out --project-name=superinvestors-app >> "$LOG" 2>&1

echo "$(date): Price update complete" >> "$LOG"
