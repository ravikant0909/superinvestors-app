CREATE TABLE IF NOT EXISTS chat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  page_context TEXT,
  question TEXT NOT NULL,
  response TEXT,
  is_suggestion INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
