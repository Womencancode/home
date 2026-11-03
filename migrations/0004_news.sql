-- Headlines from the leading news sites of each country, kept when they read as good news. One row per headline and country.
CREATE TABLE IF NOT EXISTS news_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  country TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  image TEXT,
  source TEXT NOT NULL,
  source_home TEXT,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  UNIQUE (url, country)
);
CREATE INDEX IF NOT EXISTS news_country_published ON news_items (country, hidden, published_at);
CREATE INDEX IF NOT EXISTS news_published ON news_items (hidden, published_at);
-- When the reader last ran, and when each source was last read.
CREATE TABLE IF NOT EXISTS news_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
