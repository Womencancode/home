-- Owner-editable site settings: the published home layout, the owner's draft, and later other builder choices.
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
