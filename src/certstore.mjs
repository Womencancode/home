/* Where issued certificates live: the D1 table credentials (migrations/0014_credentials.sql) when DB is bound, otherwise an in-memory
 * stand-in with the same interface for local development and the tests. Every statement is parameterised. */
const COLS = 'id, name, project, live, repo, pitch, screenshot, wave, level, exercises, date, expires, credential, submission_id, issued_by, issued_at, revoked_at, revoked_reason';
const row = (r) => (r ? { ...r, exercises: r.exercises ? JSON.parse(r.exercises) : [] } : null);

export class D1Credentials {
  constructor(db) { this.db = db; }
  async get(id) { return row(await this.db.prepare(`SELECT ${COLS} FROM credentials WHERE id = ?`).bind(id).first()); }
  async list(limit = 500) { return ((await this.db.prepare(`SELECT ${COLS} FROM credentials ORDER BY issued_at DESC LIMIT ?`).bind(limit).all()).results || []).map(row); }
  async insert(c) {
    await this.db.prepare(`INSERT INTO credentials (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
      .bind(c.id, c.name, c.project, c.live, c.repo || null, c.pitch || null, c.screenshot || null, c.wave || null, c.level || null, JSON.stringify(c.exercises || []), c.date, c.expires || null, c.credential, c.submission_id ?? null, c.issued_by, c.issued_at).run();
  }
  async revoke(id, reason, whenIso) {
    const r = await this.db.prepare('UPDATE credentials SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL').bind(whenIso, reason || null, id).run();
    return !!(r && r.meta && r.meta.changes);
  }
}

export class MemoryCredentials {
  constructor() { this.rows = new Map(); }
  async get(id) { const r = this.rows.get(id); return r ? { ...r, exercises: [...(r.exercises || [])] } : null; }
  async list() { return [...this.rows.values()].sort((a, b) => b.issued_at.localeCompare(a.issued_at)); }
  async insert(c) { if (this.rows.has(c.id)) throw Error('UNIQUE constraint failed: credentials.id'); this.rows.set(c.id, { ...c, revoked_at: null, revoked_reason: null }); }
  async revoke(id, reason, whenIso) { const r = this.rows.get(id); if (!r || r.revoked_at) return false; r.revoked_at = whenIso; r.revoked_reason = reason || null; return true; }
}

const memory = new MemoryCredentials();
export const credentialsFor = (env) => (env && env.DB ? new D1Credentials(env.DB) : memory);
