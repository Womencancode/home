-- The waitlist: people who asked to be emailed when a coming-soon feature is ready. One row per email and feature, so joining twice
-- adds nothing. The email is personal data: it is shown only to the owner, masked on the admin page and whole in the owner's CSV export.
-- ip_hash is the same salted hash the submissions table keeps for rate limiting; unsubscribed_at is set when someone asks to leave.
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature TEXT NOT NULL,
  email TEXT NOT NULL,
  use_case TEXT,
  created_at TEXT NOT NULL,
  ip_hash TEXT,
  unsubscribed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_feature_email ON waitlist (feature, email);
CREATE INDEX IF NOT EXISTS waitlist_ip_created ON waitlist (ip_hash, created_at);
