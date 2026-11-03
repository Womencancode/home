-- Upcoming events read from public calendar feeds (data/event-sources.json): an iCalendar file or an RSS or Atom feed of events.
-- One row per source and event uid, so reading a feed again updates its rows in place. start and "end" are ISO dates
-- ("2026-11-05") for all-day events, or date-times with the event's own UTC offset ("2026-11-05T18:30:00+00:00").
-- When each source was last read is kept in news_meta under "evsrc:<feed>", beside the news reader's own keys.
CREATE TABLE IF NOT EXISTS feed_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  uid TEXT NOT NULL,
  title TEXT NOT NULL,
  start TEXT NOT NULL,
  "end" TEXT NOT NULL,
  city TEXT,
  country TEXT NOT NULL,
  url TEXT,
  summary TEXT,
  kind TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  UNIQUE (source, uid)
);
CREATE INDEX IF NOT EXISTS feed_events_end ON feed_events ("end");
CREATE INDEX IF NOT EXISTS feed_events_source ON feed_events (source, fetched_at);
