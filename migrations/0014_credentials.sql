-- Women Can Code verifiable certificates (Open Badges 3.0), issued only by a signed-in owner from /admin/certificates.
-- `credential` is the signed OpenBadgeCredential as JSON. The recipient's email is never stored: only the salted hash inside it.
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project TEXT NOT NULL,
  live TEXT NOT NULL,
  repo TEXT,
  pitch TEXT,
  screenshot TEXT,
  wave TEXT,
  exercises TEXT,
  date TEXT NOT NULL,
  expires TEXT,
  credential TEXT NOT NULL,
  submission_id INTEGER,
  issued_by TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_reason TEXT
);
CREATE INDEX IF NOT EXISTS credentials_issued ON credentials (issued_at);
