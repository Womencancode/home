import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseIcs, parseEventFeed, readEventSource, rowsFrom, compileFilter, wanted, boost, refreshEvents, feedEventsFor, kindFor, unfold, nextRepeat } from '../src/feedevents.mjs';
import { upcoming, fromFeed, KINDS, kindLabel } from '../src/events.mjs';
import { eventCard, eventRow } from '../src/pages/events.mjs';
import { MemoryStore, D1Store } from '../src/store.mjs';
import { CITIES } from '../src/places.mjs';

const now = new Date('2026-10-30T12:00:00Z');
const ALL = compileFilter({});
const SOURCE = { name: 'Test Calendar', home: 'https://calendar.example.org/', feed: 'https://calendar.example.org/events.ics', country: 'GB', city: null, kind: 'meetup' };
const vevent = (lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
const vcal = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', ...events.flat(), 'END:VCALENDAR', ''].join('\r\n');

const ICS = vcal(
  vevent(['UID:folded@test', 'DTSTART;TZID=Europe/London:20261105T183000', 'DTEND;TZID=Europe/London:20261105T203000',
    'SUMMARY:Women in Data: an evening of talks about machine lea', ' rning and careers', 'LOCATION:Manchester Central Library\\, St Peter\'s Square',
    'DESCRIPTION:Three short talks\\, then mentoring.\\nBook at https://tickets.example.org/w', '\tid?x=1', 'URL:https://events.example.org/women-in-data',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder text that is not the event', 'TRIGGER:-PT15M', 'END:VALARM']),
  vevent(['UID:bst@test', 'DTSTART;TZID="Europe/London":20270410T183000', 'DTEND;TZID="Europe/London":20270410T200000', 'SUMMARY:Spring coding club']),
  vevent(['UID:ny@test', 'DTSTART;TZID=America/New_York:20261110T090000', 'DURATION:PT2H', 'SUMMARY:Cloud summit breakfast']),
  vevent(['UID:utc@test', 'DTSTART:20261112T090000Z', 'DTEND:20261112T100000Z', 'SUMMARY:Cyber security briefing', 'URL:javascript:alert(1)']),
  vevent(['UID:allday@test', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261122', 'SUMMARY:Weekend hackathon for girls']),
  vevent(['UID:oneday@test', 'DTSTART;VALUE=DATE:20261201', 'SUMMARY:Ada Lovelace lecture']),
  vevent(['UID:past@test', 'DTSTART;VALUE=DATE:20261001', 'SUMMARY:Last month\'s meetup']),
  vevent(['UID:cancelled@test', 'DTSTART:20261115T180000Z', 'STATUS:CANCELLED', 'SUMMARY:Cancelled workshop']),
  vevent(['UID:weekly@test', 'DTSTART;TZID=Europe/London:20260106T190000', 'DTEND;TZID=Europe/London:20260106T210000', 'RRULE:FREQ=WEEKLY;BYDAY=TU', 'SUMMARY:Tuesday Python night']),
  vevent(['UID:weekly-ex@test', 'DTSTART;TZID=Europe/London:20260106T190000', 'RRULE:FREQ=WEEKLY;BYDAY=TU', 'EXDATE;TZID=Europe/London:20261103T190000', 'SUMMARY:Tuesday JavaScript night']),
  vevent(['UID:monthly@test', 'DTSTART:20260114T180000Z', 'RRULE:FREQ=MONTHLY;BYDAY=2WE', 'SUMMARY:Second Wednesday DevOps meetup']),
  vevent(['UID:monthday@test', 'DTSTART;VALUE=DATE:20260115', 'RRULE:FREQ=MONTHLY;INTERVAL=2', 'SUMMARY:Every other month design crit']),
  vevent(['UID:ended@test', 'DTSTART:20260114T180000Z', 'RRULE:FREQ=MONTHLY;UNTIL=20260901T000000Z', 'SUMMARY:Ended series']),
  vevent(['UID:counted@test', 'DTSTART:20260105T180000Z', 'RRULE:FREQ=WEEKLY;COUNT=3', 'SUMMARY:Three-week course']),
  vevent(['UID:yearly@test', 'DTSTART;VALUE=DATE:20251210', 'RRULE:FREQ=YEARLY', 'SUMMARY:Yearly party']),
  vevent(['UID:daily@test', 'DTSTART:20261101T080000Z', 'RRULE:FREQ=DAILY', 'SUMMARY:Daily standup']),
  vevent(['UID:far@test', 'DTSTART;TZID=Europe/London:20270315T190000', 'RRULE:FREQ=MONTHLY', 'SUMMARY:Starts too far ahead to repeat']),
);
const byUid = () => Object.fromEntries(parseIcs(ICS, { now }).map((e) => [e.uid, e]));

test('ics: folded lines are joined, escapes undone, nested alarms ignored', () => {
  assert.equal(unfold('SUMMARY:ab\r\n c\r\n\td'), 'SUMMARY:abcd');
  const e = byUid()['folded@test'];
  assert.equal(e.title, 'Women in Data: an evening of talks about machine learning and careers');
  assert.equal(e.location, "Manchester Central Library, St Peter's Square");
  assert.match(e.summary, /^Three short talks, then mentoring\. Book at https:\/\/tickets\.example\.org\/wid\?x=1$/);
  assert.ok(!/Reminder/.test(e.summary), 'the alarm description is not the event');
  assert.equal(e.url, 'https://events.example.org/women-in-data');
});

test('ics: TZID times keep their zone offset, daylight saving included; UTC and DURATION work', () => {
  const e = byUid();
  assert.equal(e['folded@test'].start, '2026-11-05T18:30:00+00:00', 'London in November is GMT');
  assert.equal(e['folded@test'].end, '2026-11-05T20:30:00+00:00');
  assert.equal(e['bst@test'].start, '2027-04-10T18:30:00+01:00', 'London in April is BST');
  assert.equal(Date.parse(e['bst@test'].start), Date.parse('2027-04-10T17:30:00Z'));
  assert.equal(e['ny@test'].start, '2026-11-10T09:00:00-05:00');
  assert.equal(e['ny@test'].end, '2026-11-10T11:00:00-05:00', 'DURATION gives the end');
  assert.equal(e['utc@test'].start, '2026-11-12T09:00:00Z');
  /* A source that names its zone shows UTC times in it. */
  const shown = parseIcs(vcal(vevent(['UID:z', 'DTSTART:20261112T090000Z', 'SUMMARY:x'])), { now, tz: 'Africa/Lagos' });
  assert.equal(shown[0].start, '2026-11-12T10:00:00+01:00');
});

test('ics: all-day DATE values, exclusive DTEND; past and cancelled events are dropped', () => {
  const e = byUid();
  assert.equal(e['allday@test'].start, '2026-11-20');
  assert.equal(e['allday@test'].end, '2026-11-21', 'DTEND is the day after the last day');
  assert.equal(e['oneday@test'].start, '2026-12-01');
  assert.equal(e['oneday@test'].end, '2026-12-01');
  assert.equal(e['past@test'], undefined, 'started before today');
  assert.equal(e['cancelled@test'], undefined);
});

test('ics: RRULE gives only the next weekly or monthly date within 120 days, else the event is skipped', () => {
  const e = byUid();
  assert.equal(e['weekly@test'].start, '2026-11-03T19:00:00+00:00', 'the first Tuesday on or after Friday 30 October');
  assert.equal(e['weekly@test'].end, '2026-11-03T21:00:00+00:00', 'the length carries over');
  assert.equal(e['weekly-ex@test'].start, '2026-11-10T19:00:00+00:00', 'EXDATE skips 3 November');
  assert.equal(e['monthly@test'].start, '2026-11-11T18:00:00Z', 'second Wednesday of November');
  assert.equal(e['monthday@test'].start, '2026-11-15', 'January, March, ... November the 15th');
  for (const gone of ['ended@test', 'counted@test', 'yearly@test', 'daily@test', 'far@test']) assert.equal(e[gone], undefined, gone);
  assert.equal(parseIcs(ICS, { now }).filter((x) => x.uid === 'weekly@test').length, 1, 'one row per series');
  const last = nextRepeat({ y: 2026, mo: 1, d: 30 }, 'FREQ=MONTHLY;BYDAY=-1FR', { from: '2026-10-30', to: '2027-02-27' });
  assert.equal(new Date(last).toISOString().slice(0, 10), '2026-10-30', 'the last Friday of October is today');
});

test('rows: kept from today to 180 days ahead, with kind, city and http-only links', () => {
  const far = vcal(vevent(['UID:far-off', 'DTSTART;VALUE=DATE:20270601', 'SUMMARY:Next summer']));
  assert.deepEqual(rowsFrom(parseIcs(far, { now }), SOURCE, { now, filter: ALL }), [], 'more than 180 days ahead');
  const rows = rowsFrom(parseIcs(ICS, { now }), SOURCE, { now, filter: ALL });
  const r = Object.fromEntries(rows.map((x) => [x.uid, x]));
  assert.equal(r['folded@test'].city, 'Manchester', 'a known city named in the location');
  assert.equal(r['folded@test'].country, 'GB');
  assert.equal(r['folded@test'].kind, 'meetup', "the source's kind");
  assert.equal(r['allday@test'].kind, 'hackathon', 'the title names a hackathon');
  assert.equal(r['utc@test'].url, '', 'a javascript: link is not kept');
  assert.equal(kindFor('Intro to SQL workshop', SOURCE), 'workshop');
  assert.equal(kindFor('A talk', { kind: 'nonsense' }), 'community');
  for (const k of ['workshop', 'meetup', 'hackathon']) { assert.ok(KINDS.includes(k), k); assert.equal(kindLabel(k), k[0].toUpperCase() + k.slice(1)); }
});

test('rss and atom: event dates from ev:startdate or the item date, past items dropped', async () => {
  const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:ev="http://purl.org/rss/1.0/modules/event/"><channel><title>Events</title>
<item><title>Girls Who Code taster</title><link>https://example.org/e/1</link><guid>e1</guid><ev:startdate>2026-11-14T10:00:00+00:00</ev:startdate><ev:enddate>2026-11-14T13:00:00+00:00</ev:enddate><ev:location>Leeds Central Library</ev:location><description>&lt;p&gt;Learn to code in a morning.&lt;/p&gt;</description></item>
<item><title>Data careers fair</title><link>https://example.org/e/2</link><pubDate>Thu, 03 Dec 2026 18:00:00 GMT</pubDate></item>
<item><title>Old news</title><link>https://example.org/e/3</link><pubDate>Mon, 05 Oct 2026 18:00:00 GMT</pubDate></item>
<item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Thu, 03 Dec 2026 18:00:00 GMT</pubDate></item>
</channel></rss>`;
  const got = await readEventSource({ ...SOURCE, feed: 'https://example.org/events.rss' }, { now, fetcher: async () => new Response(rss, { headers: { 'content-type': 'application/rss+xml' } }) });
  assert.equal(got.format, 'rss');
  assert.equal(got.error, '');
  assert.deepEqual(got.events.map((e) => e.title), ['Girls Who Code taster', 'Data careers fair']);
  assert.equal(got.events[0].start, '2026-11-14T10:00:00+00:00');
  assert.equal(got.events[0].end, '2026-11-14T13:00:00+00:00');
  assert.equal(got.events[0].summary, 'Learn to code in a morning.');
  assert.equal(got.events[1].start, '2026-12-03T18:00:00Z');
  const [row] = rowsFrom(got.events, SOURCE, { now, filter: ALL });
  assert.equal(row.city, 'Leeds');
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Cloud meetup</title><link rel="alternate" href="https://example.org/a/1"/><id>a1</id><updated>2026-11-20T18:00:00Z</updated></entry></feed>';
  assert.deepEqual(parseEventFeed(atom, 'https://example.org/', { now }).map((e) => [e.title, e.start, e.url]), [['Cloud meetup', '2026-11-20T18:00:00Z', 'https://example.org/a/1']]);
  const bad = await readEventSource(SOURCE, { now, fetcher: async () => new Response('<html><body>hi</body></html>') });
  assert.equal(bad.error, 'not a calendar or a feed');
  const down = await readEventSource(SOURCE, { now, fetcher: async () => new Response('', { status: 503 }) });
  assert.equal(down.error, 'HTTP 503');
});

test('filter: every require list must match title or description; negative and offTopic drop; positive only ranks', () => {
  const f = compileFilter({ require: [['tech', 'coding', 'code', 'data', 'AI']], positive: ['workshop', 'women', 'learn*'], negative: ['cancel*'], offTopic: ['webinar'] });
  assert.ok(wanted('Coding workshop for girls', '', f));
  assert.ok(wanted('Saturday club', 'Learn to code with friends.', f), 'the description can carry the require word');
  assert.ok(!wanted('Bake sale', 'Cakes for the school fund.', f), 'no tech word');
  assert.ok(!wanted('AI meetup', 'This session is cancelled.', f), 'negative in the description');
  assert.ok(!wanted('Data webinar', '', f), 'offTopic in the title');
  assert.ok(!wanted('Paid training', 'domain names', f), 'whole words only: "domain" is not "AI"');
  assert.equal(boost('Women learning data workshop', '', f), 3);
  assert.equal(boost('Data night', '', f), 0);
  assert.ok(wanted('Anything at all', '', ALL), 'an empty filter keeps everything');
  const two = compileFilter({ require: [['women', 'girls'], ['code']] });
  assert.ok(wanted('Girls code club', '', two));
  assert.ok(!wanted('Code club', '', two), 'each list must match');
  const rows = rowsFrom(parseIcs(ICS, { now }), SOURCE, { now, filter: compileFilter({ require: [['python', 'javascript']] }) });
  assert.deepEqual(rows.map((r) => r.title).sort(), ['Tuesday JavaScript night', 'Tuesday Python night']);
});

const feedRow = (over = {}) => ({ id: 1, source: 'Test Calendar', uid: 'u1', title: 'Women in Data evening', start: '2026-11-05T18:30:00+00:00', end: '2026-11-05T20:30:00+00:00', city: 'Manchester', country: 'GB', url: 'https://events.example.org/wid', summary: 'Talks.', kind: 'meetup', fetched_at: now.toISOString(), source_home: 'https://calendar.example.org/', ...over });

test('merge: feed events join the calendar, deduped against seed events and each other by name and date; past ones dropped', () => {
  const seed = upcoming([], now);
  const plain = upcoming([], now, [feedRow()]);
  assert.equal(plain.length, seed.length + 1);
  const f = plain.find((e) => e.id === 'f-1');
  assert.ok(f && f.feed, 'marked as from a feed');
  assert.equal(f.start, '2026-11-05');
  assert.equal(f.time, '18:30');
  assert.equal(f.source, 'Test Calendar');
  assert.equal(f.status, 'soon');
  const twin = upcoming([], now, [feedRow(), feedRow({ id: 2, source: 'Another Calendar', uid: 'x', title: 'Women in Data Evening!' })]);
  assert.equal(twin.filter((e) => e.feed).length, 1, 'the same event from two calendars shows once');
  assert.equal(upcoming([], now, [feedRow({ start: '2026-10-01', end: '2026-10-01' })]).length, seed.length, 'over before today');
  const s = seed.find((e) => e.country && !e.approx);
  if (s) {
    const copy = upcoming([], now, [feedRow({ title: `${s.name} ${s.start.slice(0, 4)}`, start: s.start, end: s.end, country: s.country })]);
    assert.equal(copy.length, seed.length, `a feed copy of "${s.name}" is left out`);
    const later = new Date(Date.parse(`${s.end}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
    const other = upcoming([], now, [feedRow({ title: s.name, start: later, end: later, country: s.country })]);
    assert.equal(other.length, seed.length + 1, 'the same name on another date is a different event');
  }
});

test('cards: a feed event links to its own http(s) page and credits its calendar', () => {
  const [e] = upcoming([], now, [feedRow()]).filter((x) => x.feed);
  const card = eventCard(e);
  assert.match(card, /href="https:\/\/events\.example\.org\/wid" rel="noopener nofollow" target="_blank"/);
  assert.match(card, /Listed by <a href="https:\/\/calendar\.example\.org\/"[^>]*>Test Calendar<\/a>/);
  assert.match(card, /Meetup/);
  assert.match(eventRow(e), /href="https:\/\/events\.example\.org\/wid"/);
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.org/x', '//example.org/x']) {
    const x = fromFeed(feedRow({ url: bad }));
    assert.equal(x.url, '', bad);
    const [y] = upcoming([], now, [feedRow({ url: bad })]).filter((z) => z.feed);
    const html = eventCard(y);
    assert.ok(!html.includes(bad), bad);
    assert.match(html, /href="\/event\/f-1"/, 'no own link: the card opens our page');
  }
  assert.equal(fromFeed(feedRow({ city: 'Online' })).online, true);
});

test('store: upserts are idempotent, a source forgets what it stops listing, and only listed sources show', async () => {
  const store = new MemoryStore();
  const ics = (extra = []) => vcal(vevent(['UID:a', 'DTSTART;VALUE=DATE:20261110', 'SUMMARY:Coding club']), ...extra);
  let body = ics([vevent(['UID:b', 'DTSTART;VALUE=DATE:20261111', 'SUMMARY:Data meetup'])]);
  const fetcher = async () => new Response(body, { headers: { 'content-type': 'text/calendar' } });
  const list = [SOURCE];
  const r1 = await refreshEvents(store, { fetcher, now, list, filter: ALL });
  assert.equal(r1.kept, 2);
  assert.deepEqual(r1.sources.map((s) => [s.name, s.format, s.read, s.kept, s.error]), [['Test Calendar', 'ics', 2, 2, '']]);
  const first = await store.feedEvents('2026-10-30');
  await refreshEvents(store, { fetcher, now: new Date(now.getTime() + 1000), list, filter: ALL });
  const again = await store.feedEvents('2026-10-30');
  assert.equal(again.length, 2, 'reading the same feed twice stores nothing new');
  assert.deepEqual(again.map((r) => r.id), first.map((r) => r.id), 'rows keep their ids, so event links stay put');
  body = ics();
  await refreshEvents(store, { fetcher, now: new Date(now.getTime() + 2000), list, filter: ALL });
  assert.deepEqual((await store.feedEvents('2026-10-30')).map((r) => r.uid), ['a'], 'b was dropped from the feed');
  const failing = async () => { throw Error('timed out'); };
  const r4 = await refreshEvents(store, { fetcher: failing, now: new Date(now.getTime() + 3000), list, filter: ALL });
  assert.equal(r4.sources[0].error, 'timed out');
  assert.equal((await store.feedEvents('2026-10-30')).length, 1, 'a feed that does not answer keeps what it had');
  assert.equal((await feedEventsFor(store, { now, list, filter: ALL })).length, 1);
  assert.equal((await feedEventsFor(store, { now, list: [{ ...SOURCE, name: 'Someone else' }], filter: ALL })).length, 0, 'a source no longer listed shows nothing');
  assert.equal((await feedEventsFor(store, { now, list, filter: compileFilter({ require: [['python']] }) })).length, 0, 'the current filter applies');
  assert.deepEqual(await refreshEvents(new MemoryStore(), { list: [], now }), { at: now.toISOString(), sources: [], kept: 0 }, 'no sources, no work');
  await store.saveFeedEvents([{ ...feedRow(), uid: 'a', source: 'Test Calendar', title: 'Coding club, renamed' }]);
  const one = await store.feedEvents('2026-10-30');
  assert.deepEqual(one.map((r) => r.title), ['Coding club, renamed']);
  await store.pruneFeedEvents('2026-12-01');
  assert.equal((await store.feedEvents('2026-01-01')).length, 0, 'over by then');
});

const sqlite = await import('node:sqlite').catch(() => null);
/** D1's prepare/bind/first/all/run/batch over node:sqlite, so the real SQL and migrations are exercised. */
function d1(db) {
  const wrap = (sql, args = []) => ({
    bind: (...a) => wrap(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  return { prepare: (sql) => wrap(sql), batch: async (stmts) => Promise.all(stmts.map((s) => s.run())) };
}

test('store: the D1 store runs migration 0010 and upserts on (source, uid)', { skip: !sqlite && 'node:sqlite is not available' }, async () => {
  const db = new sqlite.DatabaseSync(':memory:');
  for (const m of ['0004_news.sql', '0010_feed_events.sql']) db.exec(readFileSync(new URL(`../migrations/${m}`, import.meta.url), 'utf8'));
  const store = new D1Store(d1(db));
  const row = { source: 'Test Calendar', uid: 'a', title: 'Coding club', start: '2026-11-10', end: '2026-11-10', city: null, country: 'GB', url: 'https://example.org/a', summary: '', kind: 'meetup', fetched_at: '2026-10-30T12:00:00.000Z' };
  await store.saveFeedEvents([row]);
  await store.saveFeedEvents([{ ...row, title: 'Coding club, renamed', fetched_at: '2026-10-30T13:00:00.000Z' }]);
  const rows = await store.feedEvents('2026-10-30');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Coding club, renamed');
  assert.equal(rows[0].end, '2026-11-10');
  await store.setNewsMeta('evsrc:https://calendar.example.org/events.ics', '2026-10-30T12:00:00.000Z');
  await store.setNewsMeta('src:https://news.example.org/', '2026-10-30T12:00:00.000Z');
  assert.deepEqual(Object.keys(await store.feedEventSourceTimes()), ['https://calendar.example.org/events.ics']);
  assert.deepEqual(Object.keys(await store.newsSourceTimes()), ['https://news.example.org/'], 'the news rotation does not see event sources');
  await store.clearFeedEvents('Test Calendar', '2026-10-30T13:00:00.000Z');
  assert.equal((await store.feedEvents('2026-10-30')).length, 1, 'seen in this run, kept');
  await store.clearFeedEvents('Test Calendar', '2026-10-30T14:00:00.000Z');
  assert.equal((await store.feedEvents('2026-10-30')).length, 0);
});

test('a worldwide calendar (no country) places each event by the city it names, keeps online ones as Online, and drops the rest', () => {
  const city = [...CITIES].sort((a, b) => b.name.length - a.name.length).find((c) => c.name.length > 5 && !/[^A-Za-z ]/.test(c.name));
  const WORLD = { ...SOURCE, name: 'Worldwide AI', country: null, city: null, kind: 'meetup' };
  const ics = vcal(
    vevent(['UID:in-city@test', 'DTSTART:20261110T180000Z', 'SUMMARY:AI builders night', `LOCATION:The Hall\\, 1 High Street\\, ${city.name}`]),
    vevent(['UID:online@test', 'DTSTART:20261111T170000Z', 'SUMMARY:Agents office hours', 'LOCATION:Online (Zoom)']),
    vevent(['UID:nowhere@test', 'DTSTART:20261112T170000Z', 'SUMMARY:A meetup somewhere', 'LOCATION:Building 7\\, Unit 3']));
  const rows = rowsFrom(parseIcs(ics, { now }), WORLD, { now, filter: ALL });
  const by = Object.fromEntries(rows.map((r) => [r.uid, r]));
  assert.deepEqual([by['in-city@test'].city, by['in-city@test'].country], [city.name, city.country], 'the named city gives the country');
  assert.deepEqual([by['online@test'].city, by['online@test'].country], ['Online', ''], 'online, no country');
  assert.ok(!by['nowhere@test'], 'an in-person event with no place we can vouch for is left out');
  const ev = upcoming([], now, rows.map((r, i) => ({ ...r, id: i + 1 })));
  const online = ev.find((e) => e.name === 'Agents office hours');
  assert.ok(online && online.online && online.countryRecord.name === 'Online', 'online events stay on the calendar');
  assert.match(eventRow(online), /Online/);
  assert.ok(ev.some((e) => e.name === 'AI builders night' && e.country === city.country));
});
