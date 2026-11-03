-- The app store: installable web apps (PWAs) made by the site's community, each listed from its own manifest and installed from the
-- maker's own site. A maker builds a listing step by step (status 'draft'), sends it for review ('pending'), and an owner approves or
-- declines it. Progress is tied to a private link: only a SHA-256 hash of its token is kept (draft_token_hash). The listing columns
-- (start_url to theme_color) are written by the server from the real manifest each time it is checked, never typed by the maker.
-- cofounder_interest and revenue_interest record an expression of interest in the pack's offers, never an acceptance: any agreement is
-- signed separately. paid is for a later revenue share; nothing is charged now. ip_hash is the same salted hash used for rate limits.
CREATE TABLE IF NOT EXISTS apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE,
  url TEXT,
  start_url TEXT,
  name TEXT,
  short_name TEXT,
  description TEXT,
  icons_json TEXT,
  screenshots_json TEXT,
  categories_json TEXT,
  theme_color TEXT,
  maker_name TEXT,
  maker_url TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'declined')),
  paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  checked_at TEXT,
  checks_json TEXT,
  idea TEXT,
  audience TEXT,
  support TEXT,
  consent INTEGER NOT NULL DEFAULT 0,
  cofounder_interest INTEGER NOT NULL DEFAULT 0,
  revenue_interest INTEGER NOT NULL DEFAULT 0,
  step TEXT NOT NULL DEFAULT 'idea',
  draft_token_hash TEXT,
  submitted_at TEXT,
  updated_at TEXT,
  review_note TEXT,
  ip_hash TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS apps_draft_token ON apps (draft_token_hash);
CREATE INDEX IF NOT EXISTS apps_status ON apps (status, reviewed_at);
CREATE INDEX IF NOT EXISTS apps_ip_created ON apps (ip_hash, created_at);

-- "Ask your cofounder": a maker's question on one step of the walkthrough. The founder's AI agent may answer first (ai_answer, always
-- shown labelled as the AI cofounder agent); escalated questions wait for the human founder in the admin queue (reply). Equity, money,
-- legal and publish-approval questions are always escalated.
CREATE TABLE IF NOT EXISTS app_help (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id INTEGER NOT NULL,
  step TEXT NOT NULL,
  question TEXT NOT NULL,
  ai_answer TEXT,
  escalated INTEGER NOT NULL DEFAULT 1,
  escalation_reason TEXT,
  reply TEXT,
  replied_at TEXT,
  replied_by TEXT,
  created_at TEXT NOT NULL,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS app_help_app ON app_help (app_id, created_at);
CREATE INDEX IF NOT EXISTS app_help_open ON app_help (escalated, replied_at, created_at);
CREATE INDEX IF NOT EXISTS app_help_ip_created ON app_help (ip_hash, created_at);
