-- Owner sign-in for the moderation queue: an emailed link, then a session cookie. Only hashes of tokens are stored.
CREATE TABLE IF NOT EXISTS admin_logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS admin_logins_email_created ON admin_logins (email, created_at);
