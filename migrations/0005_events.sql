-- Events as a kind of submission, with their dates. SQLite cannot change a CHECK constraint in place, so the table is rebuilt with
-- every row and column carried across.
CREATE TABLE submissions_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('story', 'work', 'talent', 'event', 'correction')),
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
  review_note TEXT,
  city TEXT,
  lat REAL,
  lon REAL,
  instagram TEXT,
  x_handle TEXT,
  tiktok TEXT,
  youtube TEXT,
  start_date TEXT,
  end_date TEXT
);
INSERT INTO submissions_next (id, kind, status, country, title, creator, medium, category, year, summary, url, submitter_name, submitter_email, ip_hash, created_at, reviewed_at, review_note, city, lat, lon, instagram, x_handle, tiktok, youtube)
  SELECT id, kind, status, country, title, creator, medium, category, year, summary, url, submitter_name, submitter_email, ip_hash, created_at, reviewed_at, review_note, city, lat, lon, instagram, x_handle, tiktok, youtube FROM submissions;
DROP TABLE submissions;
ALTER TABLE submissions_next RENAME TO submissions;
CREATE INDEX IF NOT EXISTS submissions_status_country ON submissions (status, country);
CREATE INDEX IF NOT EXISTS submissions_ip_created ON submissions (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS submissions_event_dates ON submissions (kind, status, start_date);
