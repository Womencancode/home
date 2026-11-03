/* Where submissions live. In production that is a D1 database bound as DB (migrations/0001_submissions.sql, rebuilt last by 0013). Without a binding, which is
 * local development and the tests, an in-memory store with the same interface stands in, so every page and handler runs either way. */

export const KINDS = ['story', 'work', 'talent', 'event', 'opportunity', 'speaker', 'mentor', 'mentee', 'bounty', 'tribute', 'correction'];
/** Kinds that only their own forms send (migrations/0012_careers.sql, 0013_tributes.sql), never the general /submit form. */
export const CAREER_KINDS = ['mentor', 'mentee', 'bounty', 'tribute'];
export const STATUSES = ['pending', 'approved', 'declined'];
const COLUMNS = 'id, kind, status, country, city, lat, lon, title, creator, medium, category, year, summary, url, instagram, x_handle, tiktok, youtube, start_date, end_date, prize, remote, only_country, details, verified_at, verified_by, submitter_name, submitter_email, ip_hash, created_at, reviewed_at, review_note';
const NEWS = 'id, url, country, title, summary, image, source, source_home, published_at, fetched_at, hidden';
const FEED_EVENTS = 'id, source, uid, title, start, "end", city, country, url, summary, kind, fetched_at';

/** The D1-backed store. Every statement is parameterised; nothing from a request reaches the SQL text. */
export class D1Store {
  constructor(db) { this.db = db; }
  async insert(s) {
    const r = await this.db.prepare(`INSERT INTO submissions (kind, status, country, city, lat, lon, title, creator, medium, category, year, summary, url, instagram, x_handle, tiktok, youtube, start_date, end_date, prize, remote, only_country, details, submitter_name, submitter_email, ip_hash, created_at) VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
      .bind(s.kind, s.country, s.city ?? null, s.lat ?? null, s.lon ?? null, s.title, s.creator, s.medium, s.category, s.year, s.summary, s.url, s.instagram ?? null, s.x_handle ?? null, s.tiktok ?? null, s.youtube ?? null, s.start_date ?? null, s.end_date ?? null, s.prize ?? null, s.remote ? 1 : 0, s.only_country ? 1 : 0, s.details ? JSON.stringify(s.details) : null, s.submitter_name, s.submitter_email, s.ip_hash, s.created_at).first();
    return r && r.id;
  }
  async approved(country) {
    const q = country
      ? this.db.prepare(`SELECT ${COLUMNS} FROM submissions WHERE status = 'approved' AND country = ? ORDER BY reviewed_at DESC`).bind(country)
      : this.db.prepare(`SELECT ${COLUMNS} FROM submissions WHERE status = 'approved' ORDER BY reviewed_at DESC LIMIT 2000`);
    return (await q.all()).results || [];
  }
  async byStatus(status, limit = 200) {
    return (await this.db.prepare(`SELECT ${COLUMNS} FROM submissions WHERE status = ? ORDER BY created_at DESC LIMIT ?`).bind(status, limit).all()).results || [];
  }
  async get(id) { return (await this.db.prepare(`SELECT ${COLUMNS} FROM submissions WHERE id = ?`).bind(id).first()) || null; }
  async review(id, status, note, when) {
    const r = await this.db.prepare(`UPDATE submissions SET status = ?, review_note = ?, reviewed_at = ? WHERE id = ?`).bind(status, note, when, id).run();
    return !!(r && r.meta && r.meta.changes);
  }
  /** Mark a submission's person verified (or not); only an owner calls this, from /admin. */
  async setVerified(id, on, by, whenIso) {
    const r = await this.db.prepare('UPDATE submissions SET verified_at = ?, verified_by = ? WHERE id = ?').bind(on ? whenIso : null, on ? by || 'owner' : null, id).run();
    return !!(r && r.meta && r.meta.changes);
  }
  async recentCount(ipHash, sinceIso) {
    const r = await this.db.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE ip_hash = ? AND created_at >= ?`).bind(ipHash, sinceIso).first();
    return Number((r && r.n) || 0);
  }
  async stats() {
    const rows = (await this.db.prepare(`SELECT status, COUNT(*) AS n FROM submissions GROUP BY status`).all()).results || [];
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  }
  /** Submissions created or approved since a moment, for the live map. Declined ones and corrections never light it. */
  async recentActivity(sinceIso, limit = 60) {
    const q = this.db.prepare(`SELECT id, kind, status, country, city, lat, lon, title, created_at, reviewed_at FROM submissions WHERE kind != 'correction' AND status != 'declined' AND (created_at >= ? OR reviewed_at >= ?) ORDER BY COALESCE(reviewed_at, created_at) DESC LIMIT ?`).bind(sinceIso, sinceIso, limit);
    return (await q.all()).results || [];
  }
  /* Owner sign-in: emailed links and sessions, stored as hashes. */
  async createLogin(l) { await this.db.prepare(`INSERT INTO admin_logins (email, token_hash, ip_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`).bind(l.email, l.token_hash, l.ip_hash, l.created_at, l.expires_at).run(); }
  async recentLogins(email, sinceIso) { const r = await this.db.prepare(`SELECT COUNT(*) AS n FROM admin_logins WHERE email = ? AND created_at >= ?`).bind(email, sinceIso).first(); return Number((r && r.n) || 0); }
  async consumeLogin(hash, nowIso) {
    const row = await this.db.prepare(`SELECT email, expires_at, used_at FROM admin_logins WHERE token_hash = ?`).bind(hash).first();
    if (!row || row.used_at || row.expires_at <= nowIso) return null;
    await this.db.prepare(`UPDATE admin_logins SET used_at = ? WHERE token_hash = ? AND used_at IS NULL`).bind(nowIso, hash).run();
    return row.email;
  }
  async createSession(s) { await this.db.prepare(`INSERT INTO admin_sessions (email, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)`).bind(s.email, s.token_hash, s.created_at, s.expires_at).run(); }
  async sessionEmail(hash, nowIso) { const r = await this.db.prepare(`SELECT email FROM admin_sessions WHERE token_hash = ? AND ended_at IS NULL AND expires_at > ?`).bind(hash, nowIso).first(); return r ? r.email : null; }
  async endSession(hash, nowIso) { await this.db.prepare(`UPDATE admin_sessions SET ended_at = ? WHERE token_hash = ? AND ended_at IS NULL`).bind(nowIso, hash).run(); }
  /* News: one row per headline and country; a moderator can hide any of them. */
  async saveNews(items) {
    /* A headline hidden for one country is born hidden for any other. */
    const stmt = this.db.prepare(`INSERT INTO news_items (url, country, title, summary, image, source, source_home, published_at, fetched_at, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(hidden), 0) FROM news_items WHERE url = ?)) ON CONFLICT (url, country) DO UPDATE SET title = excluded.title, summary = excluded.summary, image = excluded.image`);
    const rows = items.flatMap((i) => i.countries.map((c) => stmt.bind(i.url, c, i.title, i.summary || null, i.image || null, i.source, i.source_home || null, i.published_at, i.fetched_at, i.url)));
    for (let k = 0; k < rows.length; k += 50) await this.db.batch(rows.slice(k, k + 50));
  }
  async news(country, limit = 8) {
    const q = country
      ? this.db.prepare(`SELECT ${NEWS} FROM news_items WHERE hidden = 0 AND country = ? ORDER BY published_at DESC LIMIT ?`).bind(country, limit)
      : this.db.prepare(`SELECT ${NEWS} FROM news_items WHERE hidden = 0 AND id IN (SELECT MIN(id) FROM news_items WHERE hidden = 0 GROUP BY url) ORDER BY published_at DESC LIMIT ?`).bind(limit);
    return (await q.all()).results || [];
  }
  /** Whether a stored headline carries this picture: the image copier serves nothing else. */
  async hasNewsImage(src) { return !!(await this.db.prepare('SELECT 1 FROM news_items WHERE image = ? LIMIT 1').bind(src).first()); }
  async newsForReview(limit = 120) { return (await this.db.prepare(`SELECT ${NEWS} FROM news_items ORDER BY fetched_at DESC, published_at DESC LIMIT ?`).bind(limit).all()).results || []; }
  async setNewsHidden(id, hidden) { const r = await this.db.prepare(`UPDATE news_items SET hidden = ? WHERE url = (SELECT url FROM news_items WHERE id = ?)`).bind(hidden ? 1 : 0, id).run(); return !!(r && r.meta && r.meta.changes); }
  async pruneNews(beforeIso) { await this.db.prepare(`DELETE FROM news_items WHERE published_at < ? AND hidden = 0`).bind(beforeIso).run(); }
  async deleteNews(ids) { for (let k = 0; k < ids.length; k += 50) await this.db.batch(ids.slice(k, k + 50).map((id) => this.db.prepare(`DELETE FROM news_items WHERE id = ? AND hidden = 0`).bind(id))); }
  async newsCounts() { const rows = (await this.db.prepare(`SELECT country, COUNT(*) AS n FROM news_items WHERE hidden = 0 GROUP BY country`).all()).results || []; return Object.fromEntries(rows.map((r) => [r.country, Number(r.n)])); }
  async getNewsMeta(key) { const r = await this.db.prepare(`SELECT value FROM news_meta WHERE key = ?`).bind(key).first(); return r ? r.value : null; }
  async setNewsMeta(key, value) { await this.db.prepare(`INSERT INTO news_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).bind(key, value).run(); }
  async newsSourceTimes() { const rows = (await this.db.prepare(`SELECT key, value FROM news_meta WHERE key LIKE 'src:%'`).all()).results || []; return Object.fromEntries(rows.map((r) => [r.key.slice(4), r.value])); }
  async getSetting(key) { const r = await this.db.prepare('SELECT value FROM site_settings WHERE key = ?').bind(key).first(); return r ? JSON.parse(r.value) : null; }
  async setSetting(key, value, by, when = new Date().toISOString()) { await this.db.prepare('INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by').bind(key, JSON.stringify(value), when, by || null).run(); }
  async deleteSetting(key) { await this.db.prepare('DELETE FROM site_settings WHERE key = ?').bind(key).run(); }
  /* The waitlist (migrations/0009_waitlist.sql): one row per email and feature, so joining twice stores nothing new. Emails are read
     only for the owner's admin page (masked there) and the owner's CSV export. */
  async joinWaitlist(w) {
    const r = await this.db.prepare('INSERT INTO waitlist (feature, email, use_case, created_at, ip_hash) VALUES (?, ?, ?, ?, ?) ON CONFLICT (feature, email) DO NOTHING RETURNING id').bind(w.feature, w.email, w.use_case ?? null, w.created_at, w.ip_hash ?? null).first();
    return r ? r.id : null;
  }
  async waitlistRecentCount(ipHash, sinceIso) { const r = await this.db.prepare('SELECT COUNT(*) AS n FROM waitlist WHERE ip_hash = ? AND created_at >= ?').bind(ipHash, sinceIso).first(); return Number((r && r.n) || 0); }
  async waitlistCounts() { const rows = (await this.db.prepare('SELECT feature, COUNT(*) AS n FROM waitlist WHERE unsubscribed_at IS NULL GROUP BY feature').all()).results || []; return Object.fromEntries(rows.map((r) => [r.feature, Number(r.n)])); }
  async waitlistLatest(limit = 50) { return (await this.db.prepare("SELECT id, feature, email, use_case, created_at FROM waitlist WHERE unsubscribed_at IS NULL AND use_case IS NOT NULL AND use_case != '' ORDER BY created_at DESC, id DESC LIMIT ?").bind(limit).all()).results || []; }
  async waitlistLeave(email, atIso) { await this.db.prepare('UPDATE waitlist SET unsubscribed_at = ? WHERE email = ? AND unsubscribed_at IS NULL').bind(atIso, email).run(); }
  async waitlistExport() { return (await this.db.prepare('SELECT email, feature, created_at FROM waitlist WHERE unsubscribed_at IS NULL ORDER BY feature, created_at').all()).results || []; }
  /* Events read from calendar feeds (migrations/0010_feed_events.sql): one row per source and uid, so a second read updates in place. */
  async saveFeedEvents(rows) {
    const stmt = this.db.prepare(`INSERT INTO feed_events (source, uid, title, start, "end", city, country, url, summary, kind, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (source, uid) DO UPDATE SET title = excluded.title, start = excluded.start, "end" = excluded."end", city = excluded.city, country = excluded.country, url = excluded.url, summary = excluded.summary, kind = excluded.kind, fetched_at = excluded.fetched_at`);
    const all = rows.map((r) => stmt.bind(r.source, r.uid, r.title, r.start, r.end || r.start, r.city ?? null, r.country, r.url || null, r.summary || null, r.kind, r.fetched_at));
    for (let k = 0; k < all.length; k += 50) await this.db.batch(all.slice(k, k + 50));
  }
  /** Feed events that have not ended before a day ("2026-10-30"), soonest first. */
  async feedEvents(fromDay, limit = 1000) { return (await this.db.prepare(`SELECT ${FEED_EVENTS} FROM feed_events WHERE "end" >= ? ORDER BY start LIMIT ?`).bind(fromDay, limit).all()).results || []; }
  /** A source's rows the run at `atIso` did not see again. */
  async clearFeedEvents(source, atIso) { await this.db.prepare('DELETE FROM feed_events WHERE source = ? AND fetched_at < ?').bind(source, atIso).run(); }
  async pruneFeedEvents(beforeDay) { await this.db.prepare('DELETE FROM feed_events WHERE "end" < ?').bind(beforeDay).run(); }
  async feedEventSourceTimes() { const rows = (await this.db.prepare(`SELECT key, value FROM news_meta WHERE key LIKE 'evsrc:%'`).all()).results || []; return Object.fromEntries(rows.map((r) => [r.key.slice(6), r.value])); }
}

/** The in-memory stand-in. Same methods, same shapes. */
export class MemoryStore {
  constructor() { this.rows = []; this.nextId = 1; }
  async insert(s) { const row = { ...s, details: s.details ? JSON.stringify(s.details) : null, verified_at: null, verified_by: null, id: this.nextId++, status: 'pending', reviewed_at: null, review_note: null }; this.rows.push(row); return row.id; }
  async approved(country) { return this.rows.filter((r) => r.status === 'approved' && (!country || r.country === country)).sort((a, b) => String(b.reviewed_at).localeCompare(String(a.reviewed_at))); }
  async byStatus(status, limit = 200) { return this.rows.filter((r) => r.status === status).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit); }
  async get(id) { return this.rows.find((r) => r.id === Number(id)) || null; }
  async review(id, status, note, when) { const r = await this.get(id); if (!r) return false; Object.assign(r, { status, review_note: note, reviewed_at: when }); return true; }
  async setVerified(id, on, by, whenIso) { const r = await this.get(id); if (!r) return false; Object.assign(r, { verified_at: on ? whenIso : null, verified_by: on ? by || 'owner' : null }); return true; }
  async recentCount(ipHash, sinceIso) { return this.rows.filter((r) => r.ip_hash === ipHash && r.created_at >= sinceIso).length; }
  async stats() { const out = {}; for (const r of this.rows) out[r.status] = (out[r.status] || 0) + 1; return out; }
  async recentActivity(sinceIso, limit = 60) { return this.rows.filter((r) => r.kind !== 'correction' && r.status !== 'declined' && (r.created_at >= sinceIso || (r.reviewed_at && r.reviewed_at >= sinceIso))).sort((a, b) => String(b.reviewed_at || b.created_at).localeCompare(String(a.reviewed_at || a.created_at))).slice(0, limit); }
  async createLogin(l) { (this.logins ||= []).push({ ...l, used_at: null }); }
  async recentLogins(email, sinceIso) { return (this.logins || []).filter((l) => l.email === email && l.created_at >= sinceIso).length; }
  async consumeLogin(hash, nowIso) { const l = (this.logins || []).find((x) => x.token_hash === hash); if (!l || l.used_at || l.expires_at <= nowIso) return null; l.used_at = nowIso; return l.email; }
  async createSession(s) { (this.sessions ||= []).push({ ...s, ended_at: null }); }
  async sessionEmail(hash, nowIso) { const s = (this.sessions || []).find((x) => x.token_hash === hash && !x.ended_at && x.expires_at > nowIso); return s ? s.email : null; }
  async endSession(hash, nowIso) { const s = (this.sessions || []).find((x) => x.token_hash === hash && !x.ended_at); if (s) s.ended_at = nowIso; }
  async saveNews(items) {
    this.newsRows ||= [];
    for (const i of items) for (const c of i.countries) {
      const had = this.newsRows.find((r) => r.url === i.url && r.country === c);
      if (had) Object.assign(had, { title: i.title, summary: i.summary || null, image: i.image || null });
      else this.newsRows.push({ id: (this.nextNewsId = (this.nextNewsId || 0) + 1), url: i.url, country: c, title: i.title, summary: i.summary || null, image: i.image || null, source: i.source, source_home: i.source_home || null, published_at: i.published_at, fetched_at: i.fetched_at, hidden: this.newsRows.some((r) => r.url === i.url && r.hidden) ? 1 : 0 });
    }
  }
  async news(country, limit = 8) {
    const seen = new Set();
    return (this.newsRows || []).filter((r) => !r.hidden && (country ? r.country === country : !seen.has(r.url) && seen.add(r.url))).sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, limit);
  }
  /** Whether a stored headline carries this picture. */
  async hasNewsImage(src) { return (this.newsRows || []).some((r) => r.image === src); }
  async newsForReview(limit = 120) { return [...(this.newsRows || [])].sort((a, b) => b.fetched_at.localeCompare(a.fetched_at) || b.published_at.localeCompare(a.published_at)).slice(0, limit); }
  async setNewsHidden(id, hidden) { const row = (this.newsRows || []).find((r) => r.id === Number(id)); if (!row) return false; for (const r of this.newsRows) if (r.url === row.url) r.hidden = hidden ? 1 : 0; return true; }
  async pruneNews(beforeIso) { this.newsRows = (this.newsRows || []).filter((r) => r.hidden || r.published_at >= beforeIso); }
  async deleteNews(ids) { const gone = new Set(ids.map(Number)); this.newsRows = (this.newsRows || []).filter((r) => r.hidden || !gone.has(r.id)); }
  async newsCounts() { const out = {}; for (const r of this.newsRows || []) if (!r.hidden) out[r.country] = (out[r.country] || 0) + 1; return out; }
  async getNewsMeta(key) { return (this.meta || {})[key] ?? null; }
  async setNewsMeta(key, value) { (this.meta ||= {})[key] = value; }
  async newsSourceTimes() { return Object.fromEntries(Object.entries(this.meta || {}).filter(([k]) => k.startsWith('src:')).map(([k, v]) => [k.slice(4), v])); }
  async getSetting(key) { const v = (this.settings || {})[key]; return v === undefined ? null : JSON.parse(v); }
  async setSetting(key, value) { (this.settings ||= {})[key] = JSON.stringify(value); }
  async deleteSetting(key) { if (this.settings) delete this.settings[key]; }
  async joinWaitlist(w) {
    this.waitlist ||= [];
    if (this.waitlist.some((r) => r.feature === w.feature && r.email === w.email)) return null;
    const row = { id: (this.nextWaitlistId = (this.nextWaitlistId || 0) + 1), feature: w.feature, email: w.email, use_case: w.use_case ?? null, created_at: w.created_at, ip_hash: w.ip_hash ?? null, unsubscribed_at: null };
    this.waitlist.push(row);
    return row.id;
  }
  async waitlistRecentCount(ipHash, sinceIso) { return (this.waitlist || []).filter((r) => r.ip_hash === ipHash && r.created_at >= sinceIso).length; }
  async waitlistCounts() { const out = {}; for (const r of this.waitlist || []) if (!r.unsubscribed_at) out[r.feature] = (out[r.feature] || 0) + 1; return out; }
  async waitlistLatest(limit = 50) { return (this.waitlist || []).filter((r) => !r.unsubscribed_at && r.use_case).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, limit).map(({ id, feature, email, use_case, created_at }) => ({ id, feature, email, use_case, created_at })); }
  async waitlistLeave(email, atIso) { for (const r of this.waitlist || []) if (r.email === email && !r.unsubscribed_at) r.unsubscribed_at = atIso; }
  async waitlistExport() { return (this.waitlist || []).filter((r) => !r.unsubscribed_at).sort((a, b) => a.feature.localeCompare(b.feature) || a.created_at.localeCompare(b.created_at)).map(({ email, feature, created_at }) => ({ email, feature, created_at })); }
  async saveFeedEvents(rows) {
    this.feedRows ||= [];
    for (const r of rows) {
      const fields = { title: r.title, start: r.start, end: r.end || r.start, city: r.city ?? null, country: r.country, url: r.url || null, summary: r.summary || null, kind: r.kind, fetched_at: r.fetched_at };
      const had = this.feedRows.find((x) => x.source === r.source && x.uid === r.uid);
      if (had) Object.assign(had, fields);
      else this.feedRows.push({ id: (this.nextFeedId = (this.nextFeedId || 0) + 1), source: r.source, uid: r.uid, ...fields });
    }
  }
  async feedEvents(fromDay, limit = 1000) { return (this.feedRows || []).filter((r) => r.end >= fromDay).sort((a, b) => a.start.localeCompare(b.start)).slice(0, limit).map((r) => ({ ...r })); }
  async clearFeedEvents(source, atIso) { this.feedRows = (this.feedRows || []).filter((r) => r.source !== source || r.fetched_at >= atIso); }
  async pruneFeedEvents(beforeDay) { this.feedRows = (this.feedRows || []).filter((r) => r.end >= beforeDay); }
  async feedEventSourceTimes() { return Object.fromEntries(Object.entries(this.meta || {}).filter(([k]) => k.startsWith('evsrc:')).map(([k, v]) => [k.slice(6), v])); }
}

const memory = new MemoryStore();
/** The store for this environment: D1 when bound, otherwise the shared in-memory one. */
export function storeFor(env) { return env && env.DB ? new D1Store(env.DB) : memory; }

/* The app store (migrations/0011_apps.sql): app drafts and listings, and the "Ask your cofounder" questions. Added to both stores here,
 * in one block, so the classes above stay as they are. updateApp only ever writes the columns named in APP_WRITABLE; every value is a
 * bound parameter. */
const APP_COLUMNS = 'id, slug, url, start_url, name, short_name, description, icons_json, screenshots_json, categories_json, theme_color, maker_name, maker_url, category, status, paid, created_at, reviewed_at, checked_at, checks_json, idea, audience, support, consent, cofounder_interest, revenue_interest, step, submitted_at, updated_at, review_note';
const APP_WRITABLE = ['slug', 'url', 'start_url', 'name', 'short_name', 'description', 'icons_json', 'screenshots_json', 'categories_json', 'theme_color', 'maker_name', 'maker_url', 'category', 'status', 'reviewed_at', 'checked_at', 'checks_json', 'idea', 'audience', 'support', 'consent', 'cofounder_interest', 'revenue_interest', 'step', 'submitted_at', 'updated_at', 'review_note'];
const HELP_COLUMNS = 'id, app_id, step, question, ai_answer, escalated, escalation_reason, reply, replied_at, replied_by, created_at';
const pickApp = (fields) => Object.entries(fields).filter(([k, v]) => APP_WRITABLE.includes(k) && v !== undefined);
const hideApp = (r) => { if (!r) return null; const { draft_token_hash, ip_hash, ...rest } = r; return rest; };

Object.assign(D1Store.prototype, {
  async createApp(a) {
    const r = await this.db.prepare(`INSERT INTO apps (status, step, idea, audience, draft_token_hash, ip_hash, created_at, updated_at) VALUES ('draft', ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(a.step || 'idea', a.idea ?? null, a.audience ?? null, a.draft_token_hash, a.ip_hash ?? null, a.created_at, a.created_at).first();
    return r && r.id;
  },
  async appByToken(hash) { return hash ? (await this.db.prepare(`SELECT ${APP_COLUMNS} FROM apps WHERE draft_token_hash = ?`).bind(hash).first()) || null : null; },
  async appById(id) { return (await this.db.prepare(`SELECT ${APP_COLUMNS} FROM apps WHERE id = ?`).bind(Number(id)).first()) || null; },
  async appBySlug(slug) { return (await this.db.prepare(`SELECT ${APP_COLUMNS} FROM apps WHERE slug = ?`).bind(slug).first()) || null; },
  /** A listed or waiting app at this address (page or start address), other than `exceptId`. */
  async appByUrl(url, exceptId = 0) { return (await this.db.prepare(`SELECT ${APP_COLUMNS} FROM apps WHERE status IN ('pending', 'approved') AND (url = ? OR start_url = ?) AND id != ? LIMIT 1`).bind(url, url, Number(exceptId)).first()) || null; },
  async updateApp(id, fields) {
    const set = pickApp(fields);
    if (!set.length) return false;
    const r = await this.db.prepare(`UPDATE apps SET ${set.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...set.map(([, v]) => v), Number(id)).run();
    return !!(r && r.meta && r.meta.changes);
  },
  async approvedApps(limit = 500) { return (await this.db.prepare(`SELECT ${APP_COLUMNS} FROM apps WHERE status = 'approved' ORDER BY reviewed_at DESC LIMIT ?`).bind(limit).all()).results || []; },
  async appsByStatus(status, limit = 200) { return (await this.db.prepare(`SELECT ${APP_COLUMNS} FROM apps WHERE status = ? ORDER BY COALESCE(submitted_at, updated_at, created_at) DESC LIMIT ?`).bind(status, limit).all()).results || []; },
  async appStats() { const rows = (await this.db.prepare('SELECT status, COUNT(*) AS n FROM apps GROUP BY status').all()).results || []; return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])); },
  async appsRecentCount(ipHash, sinceIso) { const r = await this.db.prepare('SELECT COUNT(*) AS n FROM apps WHERE ip_hash = ? AND created_at >= ?').bind(ipHash, sinceIso).first(); return Number((r && r.n) || 0); },
  async addAppHelp(h) {
    const r = await this.db.prepare('INSERT INTO app_help (app_id, step, question, ai_answer, escalated, escalation_reason, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id').bind(Number(h.app_id), h.step, h.question, h.ai_answer || null, h.escalated ? 1 : 0, h.escalation_reason || null, h.created_at, h.ip_hash ?? null).first();
    return r && r.id;
  },
  async appHelpFor(appId) { return (await this.db.prepare(`SELECT ${HELP_COLUMNS} FROM app_help WHERE app_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`).bind(Number(appId)).all()).results || []; },
  /** The owner's queue: escalated questions with no reply first, then the rest, newest first, each with its app's name and status. */
  async appHelpQueue(limit = 100) { return (await this.db.prepare(`SELECT h.id, h.app_id, h.step, h.question, h.ai_answer, h.escalated, h.escalation_reason, h.reply, h.replied_at, h.replied_by, h.created_at, a.name AS app_name, a.status AS app_status FROM app_help h LEFT JOIN apps a ON a.id = h.app_id ORDER BY (h.escalated = 1 AND h.reply IS NULL) DESC, h.created_at DESC, h.id DESC LIMIT ?`).bind(limit).all()).results || []; },
  async replyAppHelp(id, reply, by, whenIso) { const r = await this.db.prepare('UPDATE app_help SET reply = ?, replied_by = ?, replied_at = ? WHERE id = ?').bind(reply, by || null, whenIso, Number(id)).run(); return !!(r && r.meta && r.meta.changes); },
  async appHelpRecentCount(ipHash, sinceIso) { const r = await this.db.prepare('SELECT COUNT(*) AS n FROM app_help WHERE ip_hash = ? AND created_at >= ?').bind(ipHash, sinceIso).first(); return Number((r && r.n) || 0); },
});

Object.assign(MemoryStore.prototype, {
  async createApp(a) {
    this.apps ||= [];
    const id = (this.nextAppId = (this.nextAppId || 0) + 1);
    this.apps.push({ id, slug: null, url: null, start_url: null, name: null, short_name: null, description: null, icons_json: null, screenshots_json: null, categories_json: null, theme_color: null, maker_name: null, maker_url: null, category: null, status: 'draft', paid: 0, created_at: a.created_at, reviewed_at: null, checked_at: null, checks_json: null, idea: a.idea ?? null, audience: a.audience ?? null, support: null, consent: 0, cofounder_interest: 0, revenue_interest: 0, step: a.step || 'idea', submitted_at: null, updated_at: a.created_at, review_note: null, draft_token_hash: a.draft_token_hash, ip_hash: a.ip_hash ?? null });
    return id;
  },
  async appByToken(hash) { return hash ? hideApp((this.apps || []).find((r) => r.draft_token_hash === hash)) : null; },
  async appById(id) { return hideApp((this.apps || []).find((r) => r.id === Number(id))); },
  async appBySlug(slug) { return hideApp((this.apps || []).find((r) => r.slug === slug)); },
  async appByUrl(url, exceptId = 0) { return hideApp((this.apps || []).find((r) => ['pending', 'approved'].includes(r.status) && (r.url === url || r.start_url === url) && r.id !== Number(exceptId))); },
  async updateApp(id, fields) { const r = (this.apps || []).find((x) => x.id === Number(id)); const set = pickApp(fields); if (!r || !set.length) return false; for (const [k, v] of set) r[k] = v; return true; },
  async approvedApps(limit = 500) { return (this.apps || []).filter((r) => r.status === 'approved').sort((a, b) => String(b.reviewed_at).localeCompare(String(a.reviewed_at))).slice(0, limit).map(hideApp); },
  async appsByStatus(status, limit = 200) { const at = (r) => String(r.submitted_at || r.updated_at || r.created_at); return (this.apps || []).filter((r) => r.status === status).sort((a, b) => at(b).localeCompare(at(a))).slice(0, limit).map(hideApp); },
  async appStats() { const out = {}; for (const r of this.apps || []) out[r.status] = (out[r.status] || 0) + 1; return out; },
  async appsRecentCount(ipHash, sinceIso) { return (this.apps || []).filter((r) => r.ip_hash === ipHash && r.created_at >= sinceIso).length; },
  async addAppHelp(h) {
    this.appHelp ||= [];
    const id = (this.nextHelpId = (this.nextHelpId || 0) + 1);
    this.appHelp.push({ id, app_id: Number(h.app_id), step: h.step, question: h.question, ai_answer: h.ai_answer || null, escalated: h.escalated ? 1 : 0, escalation_reason: h.escalation_reason || null, reply: null, replied_at: null, replied_by: null, created_at: h.created_at, ip_hash: h.ip_hash ?? null });
    return id;
  },
  async appHelpFor(appId) { return (this.appHelp || []).filter((h) => h.app_id === Number(appId)).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).map(({ ip_hash, ...h }) => h); },
  async appHelpQueue(limit = 100) {
    const open = (h) => (h.escalated && !h.reply ? 1 : 0);
    return (this.appHelp || []).slice().sort((a, b) => open(b) - open(a) || b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, limit).map(({ ip_hash, ...h }) => { const a = (this.apps || []).find((x) => x.id === h.app_id); return { ...h, app_name: a ? a.name : null, app_status: a ? a.status : null }; });
  },
  async replyAppHelp(id, reply, by, whenIso) { const h = (this.appHelp || []).find((x) => x.id === Number(id)); if (!h) return false; Object.assign(h, { reply, replied_by: by || null, replied_at: whenIso }); return true; },
  async appHelpRecentCount(ipHash, sinceIso) { return (this.appHelp || []).filter((h) => h.ip_hash === ipHash && h.created_at >= sinceIso).length; },
});
