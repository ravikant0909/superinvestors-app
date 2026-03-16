# SuperInvestors App

## Reality Check

- The app tracks 149 investor profiles, but the current 13F pipeline only covers 60 filers.
- Do not claim full 13F coverage for all tracked investors unless the pipeline and data actually support it.
- Conviction pages are separate AI-written stock research artifacts, not direct 13F coverage.

## Current Architecture

- Next.js 14 still builds as a static export via `next.config.js` with `output: 'export'`.
- Cloudflare Pages serves the public site at `https://superinvestors-app.pages.dev/`.
- The Cloudflare Worker at `https://superinvestors.ravikant0909.workers.dev/` serves `/api/*` from D1 and can also serve the built assets from `out/`.
- The product is not fully database-rendered on the fly. It ships static HTML shells and fetches runtime data from either the Worker API (`/api/*`) or generated static JSON assets under `public/`.

## Git Worktrees

**Always use a separate git worktree for each agent session.** Never work directly on the main checkout when it is dirty. Use `/Users/ravf/projects/superinvestors-app-deploy` or create another worktree.

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **API/runtime**: Cloudflare Worker in `worker/src/index.js`, deployed from the repo root `wrangler.json`
- **Database**: local SQLite `superinvestors.db` plus remote D1 `superinvestors`
- **Data pipeline**: Python 3 SEC EDGAR fetcher and loaders under `data/`
- **Node**: `v24.12.0`
- **Node path**: `/Users/ravf/.nvm/versions/node/v24.12.0/bin`
- **Cloudflare auth file**: `/Users/ravf/.cloudflare_token`

## Key Files

- `data/config.py`: tracked filer registry; `files_13f=True` controls who has filing coverage
- `data/investors/all_investors_ranked.json`: full investor roster and profile metadata
- `load_13f_to_db.py`: loads local JSON into `superinvestors.db`
- `public/conviction-data/`: generated runtime JSON assets for conviction pages
- `public/runtime-data/`: generated static runtime helpers such as `prices.json` and `portfolio-adjustments.json`
- `wrangler.json`: live unified app config
- `worker/wrangler.json`: stale old `superinvestors-chat` config; do not use for live deploys

## Cloudflare Auth

```bash
cd /Users/ravf/projects/superinvestors-app-deploy
source /Users/ravf/.cloudflare_token
export PATH="/Users/ravf/.nvm/versions/node/v24.12.0/bin:$PATH"
wrangler whoami
```

- If `wrangler whoami` fails, stop. Deploys and remote D1 commands will fail.
- Do not assume Wrangler is authenticated just because `npx wrangler` is installed.

## Local Build

```bash
cd /Users/ravf/projects/superinvestors-app-deploy
export PATH="/Users/ravf/.nvm/versions/node/v24.12.0/bin:$PATH"
npm run build
```

- Build output goes to `out/`.

## Deploy Workflow

### UI and API code changes

```bash
cd /Users/ravf/projects/superinvestors-app-deploy
source /Users/ravf/.cloudflare_token
export PATH="/Users/ravf/.nvm/versions/node/v24.12.0/bin:$PATH"

npm run build
npx wrangler deploy
npx wrangler pages deploy out --project-name superinvestors-app --branch main --commit-dirty=true
```

- `npx wrangler deploy` updates `https://superinvestors.ravikant0909.workers.dev/` and the Worker-side asset bundle.
- `npx wrangler pages deploy out --project-name superinvestors-app --branch main --commit-dirty=true` updates production `https://superinvestors-app.pages.dev/` from a worktree.
- The plain `npx wrangler pages deploy out --project-name superinvestors-app` command can create only a preview deployment instead of updating production.
- Both deploys are needed when the public Pages site and the Worker API both changed.
- Do not deploy from `/Users/ravf/projects/superinvestors-app-deploy/worker`. That directory still points at the stale `superinvestors-chat` config.

### Data changes

1. Update or regenerate the JSON under `data/` and `conviction_data/`.
2. Reload the local SQLite database and regenerate public runtime assets:

```bash
cd /Users/ravf/projects/superinvestors-app-deploy
python3 load_13f_to_db.py
```

- This also regenerates:
- `conviction_data/index.json`
- `public/conviction-data/index.json`
- `public/conviction-data/details/*.json`
- `public/runtime-data/prices.json`
- `public/runtime-data/portfolio-adjustments.json`

3. Verify local counts before touching production:

```bash
cd /Users/ravf/projects/superinvestors-app-deploy
sqlite3 superinvestors.db "
SELECT COUNT(*) AS investors FROM investors;
SELECT COUNT(DISTINCT investor_id) AS investors_with_filings FROM filings_13f;
SELECT COUNT(*) AS filings FROM filings_13f;
SELECT COUNT(*) AS holdings FROM holdings;
SELECT COUNT(*) AS holdings_history FROM holdings_history;
SELECT COUNT(*) AS position_changes FROM position_changes;
"
```

4. If the remote D1 database also needs the new data, sync it before deploying Pages. There is no checked-in one-command sync script yet. Use `wrangler d1 execute superinvestors --remote` with a SQL import generated from the local DB.
5. Large remote imports can fail behind local proxy settings. If a remote import dies after upload, retry with proxy variables unset:

```bash
env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u all_proxy -u no_proxy -u NO_PROXY \
npx wrangler d1 execute superinvestors --remote --file /tmp/superinvestors-remote-refresh.sql
```

## Verification

```bash
curl https://superinvestors.ravikant0909.workers.dev/api/investors
curl https://superinvestors.ravikant0909.workers.dev/api/investor/warren-buffett
curl https://superinvestors.ravikant0909.workers.dev/api/changes
curl https://superinvestors.ravikant0909.workers.dev/api/best-ideas
```

- Then verify the public Pages routes in a browser:
- `https://superinvestors-app.pages.dev/`
- `https://superinvestors-app.pages.dev/investors`
- `https://superinvestors-app.pages.dev/investors/warren-buffett`
- `https://superinvestors-app.pages.dev/changes`
- `https://superinvestors-app.pages.dev/best-ideas`

## Known Truths

- The investor roster is broader than the filing coverage. Profiles without filings should be labeled honestly as profile-only coverage.
- Current product copy should reflect the real filing coverage, not marketing language.
- Conviction pages are AI research and are not guaranteed to cover every holding or every investor.

## Design and Product Notes

- Default to a light background.
- Avoid fake zero counts or placeholder metrics before runtime data loads.
- Prefer explicit coverage messaging over implied completeness.
