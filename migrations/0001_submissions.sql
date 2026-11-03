-- Submissions: stories, creative works, talent and corrections sent through /submit.
-- Nothing is shown publicly until status is 'approved'. submitter_email is never rendered; it exists so a moderator can reply.
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('story', 'work', 'talent', 'correction')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  country TEXT NOT NULL,
  title TEXT NOT NULL,
  creator TEXT,
  medium TEXT,
  category TEXT,
  year INTEGER,
  summary TEXT NOT NULL,
  url TEXT,
  submitter_name TEXT,
  submitter_email TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  review_note TEXT
);
CREATE INDEX IF NOT EXISTS submissions_status_country ON submissions (status, country);
CREATE INDEX IF NOT EXISTS submissions_ip_created ON submissions (ip_hash, created_at);
